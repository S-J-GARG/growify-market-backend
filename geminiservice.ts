// Note: @google/generativeai package removed due to npm registry availability issues
// The service will use fallback responses

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Fallback responses when no API key is configured
const FALLBACK_RESPONSES = {
  growth: "Based on your growth goals, I'd recommend starting with our AI Growth Package. We help businesses scale through automated ad optimization, intelligent lead funnels, and AI-powered content strategies. Would you like me to share more details about specific services?",
  
  seo: "Our SEO services focus on both traditional search optimization and AI-powered search (AEO). We optimize for keywords, build authority, and ensure your content is discoverable by AI search engines like Perplexity and ChatGPT. Want to learn about our SEO packages?",
  
  ads: "We manage Meta Ads and Google Ads with AI-driven optimization. Our system continuously tests creatives, audiences, and bidding strategies to maximize ROAS. Our typical clients see 3-4x ROI within the first few months.",
  
  default: "Welcome to Growify Market! We're an AI-powered growth agency helping businesses automate revenue and dominate markets. We offer services in AI SEO, performance ads, web development, and complete digital transformation. How can I help you grow today?"
};

function getFallbackResponse(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('growth') || lowerPrompt.includes('scale') || lowerPrompt.includes('revenue')) {
    return FALLBACK_RESPONSES.growth;
  }
  if (lowerPrompt.includes('seo') || lowerPrompt.includes('search') || lowerPrompt.includes('google')) {
    return FALLBACK_RESPONSES.seo;
  }
  if (lowerPrompt.includes('ads') || lowerPrompt.includes('facebook') || lowerPrompt.includes('meta') || lowerPrompt.includes('marketing')) {
    return FALLBACK_RESPONSES.ads;
  }
  
  return FALLBACK_RESPONSES.default;
}

export async function askGrowifyConsultant(prompt: string): Promise<string> {
  // Using fallback responses (Gemini API not available)
  console.log("Using fallback AI response (no API key configured)");
  return getFallbackResponse(prompt);
}

export async function generateSEOMeta(title: string, content: string): Promise<{ metaTitle: string; metaDescription: string }> {
  // Generate basic meta from title (Gemini API not available)
  const baseTitle = title.length > 50 ? title.substring(0, 50) + "..." : title;
  const excerpt = content.replace(/<[^>]*>/g, '').substring(0, 150);
  return {
    metaTitle: `${baseTitle} | Growify Market`,
    metaDescription: excerpt + "..."
  };
}
