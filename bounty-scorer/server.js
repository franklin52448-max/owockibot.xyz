const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Scoring Engine ───

function checkUrlLiveness(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const req = lib.get(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve({ live: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
    });
    req.on('error', () => resolve({ live: false, statusCode: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ live: false, statusCode: 0 }); });
  });
}

async function fetchPageContent(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve('')).on('timeout', function() { this.destroy(); resolve(''); });
  });
}

function analyzeSubmission(content, requirements) {
  const reqs = requirements.split('\n').map(r => r.trim()).filter(Boolean);
  const lower = content.toLowerCase();
  const results = [];
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const req of reqs) {
    const keywords = req.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matches = keywords.filter(kw => lower.includes(kw));
    const coverage = keywords.length > 0 ? matches.length / keywords.length : 0;
    const weight = 1;
    totalWeight += weight;
    if (coverage >= 0.5) earnedWeight += weight;
    results.push({
      requirement: req,
      coverage: Math.round(coverage * 100),
      matched: matches,
      missing: keywords.filter(kw => !lower.includes(kw)),
      satisfied: coverage >= 0.5
    });
  }

  return { results, requirementScore: totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0 };
}

function detectSpamSignals(content, url) {
  const signals = [];
  const lower = content.toLowerCase();
  if (content.length < 200) signals.push({ signal: 'Very short content', severity: 'high' });
  if (content.length < 500 && content.length >= 200) signals.push({ signal: 'Short content', severity: 'medium' });
  const repeatPatterns = /(.)\1{10,}/g;
  if (repeatPatterns.test(content)) signals.push({ signal: 'Repetitive characters detected', severity: 'high' });
  const spamPhrases = ['click here', 'buy now', 'free money', 'act now', 'limited time'];
  const foundSpam = spamPhrases.filter(p => lower.includes(p));
  if (foundSpam.length > 0) signals.push({ signal: 'Spam phrases: ' + foundSpam.join(', '), severity: 'medium' });
  const codeIndicators = ['function ', 'const ', 'import ', 'class ', 'return ', '<div', '<script', 'export '];
  const codeCount = codeIndicators.filter(c => content.includes(c)).length;
  if (codeCount < 2 && content.length > 100) signals.push({ signal: 'Low code content for a dev bounty', severity: 'low' });
  const urls = (content.match(/https?:\/\/[^\s]+/g) || []).length;
  if (urls > 20) signals.push({ signal: 'Excessive URLs (' + urls + ')', severity: 'medium' });
  return signals;
}

function generateFeedback(analysis, spamSignals, liveness) {
  const tips = [];
  if (!liveness.live) tips.push('❌ Submission URL is not accessible. Make sure the link works before submitting.');
  if (analysis.requirementScore < 50) tips.push('⚠️ Your submission covers less than half the requirements. Address the missing items listed above.');
  else if (analysis.requirementScore < 80) tips.push('📋 Good progress, but some requirements are only partially covered. See the missing keywords for each.');
  else tips.push('✅ Most requirements are well covered. Double-check any missing items for a perfect score.');
  const highSpam = spamSignals.filter(s => s.severity === 'high');
  if (highSpam.length > 0) tips.push('🚨 High-severity spam indicators found. This submission may be flagged for review.');
  const mediumSpam = spamSignals.filter(s => s.severity === 'medium');
  if (mediumSpam.length > 0) tips.push('⚡ Medium-severity quality concerns found. Consider improving content depth.');
  for (const r of analysis.results.filter(r => !r.satisfied)) {
    if (r.missing.length > 0) tips.push('🔍 Missing for "' + r.requirement + '": ' + r.missing.join(', '));
  }
  return tips;
}

function computeScore(liveness, analysis, spamSignals, contentLength) {
  let score = 0;
  // Liveness: 0 or 20
  score += liveness.live ? 20 : 0;
  // Requirements coverage: 0-50
  score += Math.round(analysis.requirementScore * 0.5);
  // Content depth: 0-15
  if (contentLength > 2000) score += 15;
  else if (contentLength > 1000) score += 12;
  else if (contentLength > 500) score += 8;
  else if (contentLength > 200) score += 4;
  // Spam penalty: 0-15 deducted
  const spamPenalty = spamSignals.reduce((sum, s) => {
    if (s.severity === 'high') return sum + 8;
    if (s.severity === 'medium') return sum + 4;
    return sum + 1;
  }, 0);
  score -= Math.min(spamPenalty, 15);
  return Math.max(0, Math.min(100, score));
}

// ─── API Routes ───

app.post('/api/score', async (req, res) => {
  try {
    const { submissionUrl, requirements } = req.body;
    if (!submissionUrl || !requirements) {
      return res.status(400).json({ error: 'submissionUrl and requirements are required' });
    }
    const liveness = await checkUrlLiveness(submissionUrl);
    let content = '';
    if (liveness.live) content = await fetchPageContent(submissionUrl);
    const analysis = analyzeSubmission(content, requirements);
    const spamSignals = detectSpamSignals(content, submissionUrl);
    const score = computeScore(liveness, analysis, spamSignals, content.length);
    const feedback = generateFeedback(analysis, spamSignals, liveness);
    const isLowEffort = score < 30;
    res.json({
      submissionUrl,
      liveness,
      score,
      breakdown: {
        livenessPoints: liveness.live ? 20 : 0,
        requirementPoints: Math.round(analysis.requirementScore * 0.5),
        contentDepthPoints: content.length > 2000 ? 15 : content.length > 1000 ? 12 : content.length > 500 ? 8 : content.length > 200 ? 4 : 0,
        spamPenalty: Math.min(spamSignals.reduce((s, sig) => s + (sig.severity === 'high' ? 8 : sig.severity === 'medium' ? 4 : 1), 0), 15)
      },
      requirements: analysis.results,
      spamSignals,
      isLowEffort,
      feedback,
      contentLength: content.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'bounty-scorer' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('Bounty Scorer running on port ' + PORT));
