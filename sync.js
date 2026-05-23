const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');

// ============================================
// ⬇️ REPLACE THESE WITH YOUR REAL VALUES ⬇️
// ============================================
const SUPABASE_URL = 'https://gdqeryiyqypgnwdohtpz.supabase.co';  // ← your Project URL
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWVyeWl5cXlwZ253ZG9odHB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ5NzMxNCwiZXhwIjoyMDk1MDczMzE0fQ.GGLTKrxyaBN-zCQKbRFLg4hE0Jkv9mZjgcUK_KHxEwk';      // ← your service_role key
// ============================================

const BLOG_URL = 'https://prasnottor.blogspot.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'public' },
  realtime: false
});

async function fetchAllPosts() {
  let entries = [];
  let startIndex = 1;
  const maxResults = 500;
  while (true) {
    const url = `${BLOG_URL}/feeds/posts/default?alt=json&max-results=${maxResults}&start-index=${startIndex}`;
    const { data } = await axios.get(url);
    if (!data.feed || !data.feed.entry) break;
    entries.push(...data.feed.entry);
    const total = parseInt(data.feed.openSearch$totalResults.$t) || entries.length;
    if (startIndex + maxResults > total) break;
    startIndex += maxResults;
  }
  return entries;
}

function extractQuestion(entry) {
  const content = entry.content?.$t || '';
  const $ = cheerio.load(content);
  const mcq = $('.mcq-item').first();
  if (!mcq.length) return null;

  const question = $('.mcq-question').first().text().trim() || entry.title.$t;
  const options = [];
  $('.mcq-option').each((i, el) => {
    options.push($(el).text().trim().replace(/^[A-D]\)\s*/, ''));
  });
  const correct = mcq.attr('data-correct') || '';
  const explanation = $('.short-answer-content').html() || '';

  if (options.length !== 4 || !correct) return null;

  const postId = entry.id.$t.match(/post-(\d+)/)?.[1] || '';
  return {
    post_id: postId,
    title: question,
    options: JSON.stringify(options),
    correct_answer: correct,
    explanation,
    category: entry.category ? entry.category.map(c => c.term).join(', ') : 'general'
  };
}

async function sync() {
  console.log('Fetching blog posts...');
  const posts = await fetchAllPosts();
  let count = 0;
  for (const post of posts) {
    const q = extractQuestion(post);
    if (!q) continue;
    const { error } = await supabase
      .from('questions')
      .upsert(q, { onConflict: 'post_id' });
    if (!error) count++;
  }
  console.log(`Synced ${count} questions.`);
}

sync().catch(console.error);
