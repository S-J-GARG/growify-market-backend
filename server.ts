import express from "express";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'u246764992_shivank',
  password: process.env.DB_PASSWORD || 'Shivank@54321',
  database: process.env.DB_NAME || 'u246764992_shivank',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool: mysql.Pool | null = null;
let dbReady = false;

// In-memory fallback storage
let posts: any[] = [];
let categories: string[] = ['AI Trends', 'Case Studies', 'SEO', 'PPC'];
let inquiries: any[] = [];
let adminPassword = 'growify_admin_2026';

// Initialize database connection and tables
async function initDb() {
  try {
    console.log('Connecting to MySQL database...');
    pool = mysql.createPool(dbConfig);
    
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('MySQL connected successfully');
    
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INT PRIMARY KEY DEFAULT 1,
        password_hash VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        excerpt TEXT,
        content TEXT,
        author VARCHAR(100),
        date VARCHAR(50),
        image TEXT,
        category VARCHAR(100),
        meta_title VARCHAR(255),
        meta_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(50),
        company VARCHAR(100),
        service VARCHAR(100),
        message TEXT,
        status VARCHAR(20) DEFAULT 'new',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      const [admin] = await pool.execute('SELECT * FROM admin_settings WHERE id = 1');
      if ((admin as any[]).length === 0) {
        const bcrypt = await import('bcryptjs');
        const defaultPassword = await bcrypt.hash('growify_admin_2026', 10);
        await pool.execute('INSERT INTO admin_settings (id, password_hash) VALUES (1, ?)', [defaultPassword]);
      }
    } catch (e) {
      console.log('Admin setup skipped');
    }

    try {
      const [cats] = await pool.execute('SELECT * FROM categories');
      if ((cats as any[]).length === 0) {
        const defaultCategories = ['AI Trends', 'Case Studies', 'SEO', 'PPC'];
        for (const cat of defaultCategories) {
          await pool.execute('INSERT INTO categories (name) VALUES (?)', [cat]);
        }
      }
    } catch (e) {
      console.log('Categories setup skipped');
    }

    try {
      const [rows] = await pool.execute('SELECT * FROM posts ORDER BY created_at DESC');
      posts = rows as any[];
    } catch (e) {}

    try {
      const [cats] = await pool.execute('SELECT name FROM categories ORDER BY name');
      categories = (cats as any[]).map(r => r.name);
    } catch (e) {}

    try {
      const [existingPosts]: any = await pool.execute('SELECT COUNT(*) as count FROM posts');
      const count = existingPosts?.[0]?.count || 0;
      if (count === 0) {
        const defaultPosts = [
          { id: '1', title: "The Rise of AI in Search: SEO vs AEO", slug: "rise-of-ai-in-search", excerpt: "Understanding how AI search engines like Perplexity and SearchGPT are changing the way users find information online.", author: "Growth Team", date: "Oct 12, 2024", image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800", category: "AI Trends", content: "<h1>The Future of Search</h1><p>Search is evolving from keywords to conversations.</p>", meta_title: "The Rise of AI in Search: SEO vs AEO", meta_description: "Understanding how AI search engines are changing SEO." },
          { id: '2', title: "Scaling D2C Revenue with Performance AI", slug: "scaling-d2c-revenue", excerpt: "How automated ad optimization helped our client reach ₹3.5 Cr in revenue in just 8 months.", author: "Performance Lead", date: "Sep 28, 2024", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800", category: "Case Studies", content: "<h1>D2C Growth Story</h1><p>Learn how we scaled a D2C brand to ₹3.5 Cr in revenue.</p>", meta_title: "Scaling D2C Revenue with Performance AI", meta_description: "How automated ad optimization drives revenue growth." },
          { id: '3', title: "The Future of Local Business Marketing", slug: "future-local-business-marketing", excerpt: "Why Google Business Profile and local citations remain the backbone of local growth.", author: "SEO Strategist", date: "Nov 05, 2024", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=800", category: "SEO", content: "<h1>Local SEO in the AI Era</h1><p>Google Business Profile remains crucial for local businesses.</p>", meta_title: "The Future of Local Business Marketing", meta_description: "Local SEO strategies for the AI era." }
        ];
        for (const post of defaultPosts) {
          await pool.execute(`INSERT INTO posts (id, title, slug, excerpt, content, author, date, image, category, meta_title, meta_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [post.id, post.title, post.slug, post.excerpt, post.content, post.author, post.date, post.image, post.category, post.meta_title, post.meta_description]);
        }
        const [rows] = await pool.execute('SELECT * FROM posts ORDER BY created_at DESC');
        posts = rows as any[];
      }
    } catch (e) {
      console.log('Default posts insertion skipped:', e);
    }

    dbReady = true;
    console.log('MySQL Database initialized successfully');
  } catch (err) {
    console.error('DB Initialization Error:', err);
    console.log('Running in FALLBACK mode with in-memory storage');
    dbReady = false;
  }
}

let DOMPurify: any;
function getDOMPurify() {
  if (!DOMPurify) {
    const window = new JSDOM('').window;
    DOMPurify = createDOMPurify(window);
  }
  return DOMPurify;
}

const JWT_SECRET = process.env.JWT_SECRET || "growify_secret_key_change_me";
const GOOGLE_SHEET_WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;
const BASE_URL = process.env.BASE_URL || "https://growifymarket.com";

// Determine production mode
const isProduction = process.env.NODE_ENV === "production";

// Find the correct path to dist folder - try multiple possible locations
function findDistPath(): string {
  // When server is in backend/, React build is in ../frontend/dist
  const possiblePaths = [
    path.join(__dirname, '..', 'frontend', 'dist'),  // Separate frontend folder
    path.join(__dirname, '..', 'dist'),  // When server is in root dist/server/
    path.join(__dirname, 'dist'),        // When server is in project root
    path.join(__dirname, '..', '..', 'dist'),  // Two levels up
    path.join(process.cwd(), 'dist'),
    path.join(__dirname, 'public_html', 'dist'),
    path.join(__dirname, '..', 'public_html', 'dist'),
    '/home/u246764992/growifymarket.com/dist',
    '/home/u246764992/growifymarket.com/public_html/dist',
    '/home/u246764992/domains/growifymarket.com/public_html/dist'
  ];
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const indexPath = path.join(p, 'index.html');
        if (fs.existsSync(indexPath)) {
          console.log('Found dist at:', p);
          return p;
        }
      }
    } catch (e) {
      console.log('Path not accessible:', p);
    }
  }
  
  // Fallback to __dirname/dist
  const fallbackPath = path.join(__dirname, 'dist');
  console.log('Using fallback dist path:', fallbackPath);
  return fallbackPath;
}

// Find the correct path to uploads folder
function findUploadsPath(): string {
  const possiblePaths = [
    path.join(__dirname, '..', 'frontend', 'public', 'uploads'),  // Separate frontend folder
    path.join(__dirname, '..', 'public', 'uploads'),  // When server is in dist/server/
    path.join(__dirname, 'public', 'uploads'),        // When server is in project root
    path.join(__dirname, '..', '..', 'public', 'uploads'),  // Two levels up
    path.join(process.cwd(), 'public', 'uploads'),
    path.join(__dirname, 'public_html', 'uploads'),
    path.join(__dirname, '..', 'public_html', 'uploads'),
    '/home/u246764992/growifymarket.com/public/uploads',
    '/home/u246764992/growifymarket.com/public_html/uploads'
  ];
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log('Found uploads at:', p);
        return p;
      }
    } catch {}
  }
  
  return path.join(__dirname, 'public', 'uploads');
}

const distPath = findDistPath();
const uploadsPath = findUploadsPath();

console.log('Using dist path:', distPath);
console.log('Using uploads path:', uploadsPath);
console.log('__dirname:', __dirname);
console.log('process.cwd():', process.cwd());
console.log('isProduction:', isProduction);

async function startServer() {
  await initDb();
  
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use((req, res, next) => {
    console.log('REQ:', req.method, req.path);
    next();
  });

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "https:", "blob:"],
        "connect-src": ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.tailwindcss.com"],
        "frame-ancestors": ["'self'", "https://*.google.com", "https://*.run.app"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    hsts: false,
  }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts, please try again later." }
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.admin_token;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      jwt.verify(token, JWT_SECRET);
      next();
    } catch (err) {
      res.clearCookie("admin_token");
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const cookieOptions = isProduction 
    ? { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: 24 * 60 * 60 * 1000, path: '/' }
    : { httpOnly: true, secure: false, sameSite: 'lax' as const, maxAge: 24 * 60 * 60 * 1000, path: '/' };

  app.use("/api", apiLimiter);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: dbReady ? 'mysql' : 'fallback',
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const { password } = req.body;
    try {
      if (dbReady && pool) {
        const [rows]: any = await pool.execute('SELECT password_hash FROM admin_settings WHERE id = 1');
        if (rows.length > 0) {
          const bcrypt = await import('bcryptjs');
          const valid = await bcrypt.compare(password, rows[0].password_hash);
          if (valid) {
            const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
            res.cookie("admin_token", token, cookieOptions);
            return res.json({ success: true });
          }
        }
      }
      if (password === adminPassword) {
        const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie("admin_token", token, cookieOptions);
        return res.json({ success: true });
      }
      res.status(401).json({ error: "Invalid password" });
    } catch (err) {
      console.error('Login error:', err);
      if (password === adminPassword) {
        const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie("admin_token", token, cookieOptions);
        return res.json({ success: true });
      }
      res.status(401).json({ error: "Invalid password" });
    }
  });

  app.post("/api/auth/change-password", authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
      if (dbReady && pool) {
        const [rows]: any = await pool.execute('SELECT password_hash FROM admin_settings WHERE id = 1');
        if (rows.length > 0) {
          const bcrypt = await import('bcryptjs');
          const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
          if (valid) {
            const newHash = await bcrypt.hash(newPassword, 10);
            await pool.execute('UPDATE admin_settings SET password_hash = ? WHERE id = 1', [newHash]);
            return res.json({ success: true });
          }
        }
      }
      if (currentPassword === adminPassword) {
        adminPassword = newPassword;
        return res.json({ success: true });
      }
      res.status(401).json({ error: "Current password is incorrect" });
    } catch (err) {
      console.error('Password change error:', err);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("admin_token", cookieOptions);
    res.json({ success: true });
  });

  app.get("/api/auth/check", authenticate, (req, res) => {
    res.json({ authenticated: true });
  });

  // Default blog posts as fallback (always available)
  const defaultPosts = [
    { id: '1', title: "The Rise of AI in Search: SEO vs AEO", slug: "rise-of-ai-in-search", excerpt: "Understanding how AI search engines like Perplexity and SearchGPT are changing the way users find information online.", author: "Growth Team", date: "Oct 12, 2024", image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800", category: "AI Trends", content: "<h1>The Future of Search</h1><p>Search is evolving from keywords to conversations.</p>", meta_title: "The Rise of AI in Search: SEO vs AEO", meta_description: "Understanding how AI search engines are changing SEO." },
    { id: '2', title: "Scaling D2C Revenue with Performance AI", slug: "scaling-d2c-revenue", excerpt: "How automated ad optimization helped our client reach ₹3.5 Cr in revenue in just 8 months.", author: "Performance Lead", date: "Sep 28, 2024", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800", category: "Case Studies", content: "<h1>D2C Growth Story</h1><p>Learn how we scaled a D2C brand to ₹3.5 Cr in revenue.</p>", meta_title: "Scaling D2C Revenue with Performance AI", meta_description: "How automated ad optimization drives revenue growth." },
    { id: '3', title: "The Future of Local Business Marketing", slug: "future-local-business-marketing", excerpt: "Why Google Business Profile and local citations remain the backbone of local growth.", author: "SEO Strategist", date: "Nov 05, 2024", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=800", category: "SEO", content: "<h1>Local SEO in the AI Era</h1><p>Google Business Profile remains crucial for local businesses.</p>", meta_title: "The Future of Local Business Marketing", meta_description: "Local SEO strategies for the AI era." }
  ];

  // Initialize posts with default posts for fallback mode
  if (posts.length === 0) {
    posts = [...defaultPosts];
  }

  app.get("/api/posts", async (req, res) => {
    try {
      if (dbReady && pool) {
        const [rows]: any = await pool.execute('SELECT * FROM posts ORDER BY created_at DESC');
        if (rows && rows.length > 0) {
          return res.json(rows);
        }
      }
      res.json(defaultPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
      res.json(defaultPosts);
    }
  });

  app.get("/api/posts/slug/:slug", async (req, res) => {
    try {
      if (dbReady && pool) {
        const [rows]: any = await pool.execute('SELECT * FROM posts WHERE slug = ?', [req.params.slug]);
        if (rows.length === 0) {
          return res.status(404).json({ error: "Post not found" });
        }
        return res.json(rows[0]);
      }
      const post = posts.find(p => p.slug === req.params.slug);
      if (!post) return res.status(404).json({ error: "Post not found" });
      res.json(post);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  // Upload endpoint for images
  app.post("/api/upload", async (req, res) => {
    try {
      const { image, name } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }
      
      // In production, you'd save to file system or cloud storage
      // For now, return the base64 as data URL
      const ext = name?.split('.').pop() || 'png';
      const dataUrl = `data:image/${ext};base64,${image.replace(/^data:image\/\w+;base64,/, '')}`;
      
      res.json({ url: dataUrl });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  app.post("/api/posts", authenticate, async (req, res) => {
    try {
      const post = req.body;
      if (post.content) {
        post.content = getDOMPurify().sanitize(post.content);
      }
      
      post.id = post.id || require('crypto').randomUUID();
      
      if (dbReady && pool) {
        if (post.id) {
          await pool.execute(`
            UPDATE posts SET title=?, slug=?, excerpt=?, content=?, author=?, 
            date=?, image=?, category=?, meta_title=?, meta_description=? WHERE id=?
          `, [post.title, post.slug, post.excerpt, post.content, post.author, 
              post.date, post.image, post.category, post.meta_title, post.meta_description, post.id]);
        } else {
          await pool.execute(`
            INSERT INTO posts (id, title, slug, excerpt, content, author, date, image, category, meta_title, meta_description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [post.id, post.title, post.slug, post.excerpt, post.content, post.author,
              post.date, post.image, post.category, post.meta_title, post.meta_description]);
        }
      } else {
        const idx = posts.findIndex(p => p.id === post.id);
        if (idx >= 0) {
          posts[idx] = post;
        } else {
          posts.push(post);
        }
      }
      res.json(post);
    } catch (err) {
      console.error('Error saving post:', err);
      res.status(500).json({ error: "Failed to save post" });
    }
  });

  app.delete("/api/posts/:id", authenticate, async (req, res) => {
    try {
      if (dbReady && pool) {
        await pool.execute('DELETE FROM posts WHERE id = ?', [req.params.id]);
      } else {
        posts = posts.filter(p => p.id !== req.params.id);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // Default categories always available
  const defaultCategories = ['AI Trends', 'Case Studies', 'SEO', 'PPC'];

  app.get("/api/categories", async (req, res) => {
    try {
      if (dbReady && pool) {
        const [rows]: any = await pool.execute('SELECT name FROM categories ORDER BY name');
        if (rows && rows.length > 0) {
          return res.json(rows.map((r: any) => r.name));
        }
      }
      res.json(defaultCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
      res.json(defaultCategories);
    }
  });

  app.post("/api/categories", authenticate, async (req, res) => {
    try {
      const newCategories = req.body;
      if (dbReady && pool) {
        await pool.execute('DELETE FROM categories');
        for (const cat of newCategories) {
          await pool.execute('INSERT INTO categories (name) VALUES (?)', [cat]);
        }
      } else {
        categories = newCategories;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save categories" });
    }
  });

  app.get("/api/inquiries", authenticate, async (req, res) => {
    try {
      if (dbReady && pool) {
        const [rows] = await pool.execute('SELECT * FROM inquiries ORDER BY timestamp DESC');
        return res.json(rows);
      }
      res.json(inquiries);
    } catch (err) {
      res.json(inquiries);
    }
  });

  app.patch("/api/inquiries/:id", authenticate, async (req, res) => {
    try {
      const { status } = req.body;
      if (dbReady && pool) {
        await pool.execute('UPDATE inquiries SET status = ? WHERE id = ?', [status, req.params.id]);
      } else {
        const idx = inquiries.findIndex(i => i.id === req.params.id);
        if (idx >= 0) inquiries[idx].status = status;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update inquiry" });
    }
  });

  app.post("/api/contact", async (req, res) => {
    const { name, email, phone, company, website, businessType, services, budget, goal, timeline, challenge, service, message } = req.body;
    const id = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();
    
    console.log("New Contact Form Submission:", { name, email, phone, company, timestamp });
    
    try {
      if (dbReady && pool) {
        await pool.execute(`
          INSERT INTO inquiries (id, name, email, phone, company, service, message, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
        `, [id, name, email, phone, company, service, message]);
        console.log("Inquiry saved to MySQL database");
      } else {
        inquiries.unshift({ id, name, email, phone, company, service, message, status: 'new', timestamp });
        console.log("Inquiry saved to in-memory storage (fallback mode)");
      }

      if (GOOGLE_SHEET_WEBHOOK_URL) {
        try {
          const webhookPayload = {
            timestamp,
            name,
            email,
            phone,
            company,
            website: website || '',
            businessType: businessType || '',
            services: services || service || '',
            budget: budget || '',
            goal: goal || '',
            timeline: timeline || '',
            challenge: challenge || '',
            message: message || ''
          };
          
          const response = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
          });
          
          if (response.ok) {
            console.log("Google Sheet updated successfully");
          } else {
            console.error("Google Sheet webhook returned error:", response.status);
          }
        } catch (webhookErr) {
          console.error("Google Sheet webhook failed:", webhookErr);
        }
      }
    } catch (err) {
      console.error("Save inquiry error:", err);
    }

    res.json({ success: true, message: "Inquiry received. Our growth team will contact you shortly." });
  });

  app.post("/api/ai/consultant", async (req, res) => {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });
    try {
      const { askGrowifyConsultant } = await import('./geminiservice.js');
      const answer = await askGrowifyConsultant(prompt);
      res.json({ answer });
    } catch (err) {
      console.error("AI consultant error:", err);
      res.status(500).json({ error: "AI service failed" });
    }
  });

  app.post('/api/ai/generate-seo', async (req, res) => {
    const { title, content } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });
    try {
      const { generateSEOMeta } = await import('./geminiservice.js');
      const result = await generateSEOMeta(title, content);
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: 'SEO generation failed' });
    }
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: " + BASE_URL + "/sitemap.xml");
  });

  app.get("/sitemap.xml", async (req, res) => {
    try {
      let postsForSitemap: any[] = defaultPosts;
      if (dbReady && pool) {
        const [rows]: any = await pool.execute('SELECT slug FROM posts');
        if (rows && rows.length > 0) {
          postsForSitemap = rows;
        }
      }
      
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      
      const staticPages = ["", "/about", "/services", "/industries", "/packages", "/blog", "/contact"];
      staticPages.forEach(page => {
        xml += '  <url>\n    <loc>' + BASE_URL + page + '</loc>\n    <changefreq>weekly</changefreq>\n    <priority>' + (page === "" ? "1.0" : "0.8") + '</priority>\n  </url>\n';
      });
      
      postsForSitemap.forEach((post: any) => {
        xml += '  <url>\n    <loc>' + BASE_URL + '/blog/' + post.slug + '</loc>\n    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n';
      });
      
      xml += '</urlset>';
      res.type("application/xml");
      res.send(xml);
    } catch (err) {
      res.status(500).send("Error generating sitemap");
    }
  });

  // Serve static files from dist in production
  if (isProduction) {
    app.use(express.static(distPath, { 
      index: false,
      maxAge: '1d',
      fallthrough: true
    }));
    
    // Also try public_html paths relative to server location
    const publicHtmlDist = path.join(__dirname, '..', 'public_html', 'dist');
    app.use(express.static(publicHtmlDist, { 
      index: false,
      maxAge: '1d',
      fallthrough: true
    }));
    
    app.use("/uploads", express.static(uploadsPath));
    app.use("/uploads", express.static(path.join(__dirname, '..', 'public_html', 'uploads')));
  }

  // SPA fallback
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
      return next();
    }
    
    console.log('SPA fallback for:', req.path);
    
    if (isProduction) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Database mode: ${dbReady ? 'MySQL' : 'Fallback (in-memory)'}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
