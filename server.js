const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 500 * 1024 * 1024 } 
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'LUMIX Backend running ✅', version: '2.0.0' });
});

// Upload video to Replicate
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    console.log('File received:', req.file.originalname, req.file.size, 'bytes', req.file.mimetype);

    // Send raw buffer to Replicate
    const response = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'video/mp4',
        'Content-Length': req.file.size.toString(),
        'Content-Disposition': 'attachment; filename="video.mp4"'
      },
      body: req.file.buffer
    });

    const text = await response.text();
    console.log('Replicate raw response:', text);

    let data;
    try { data = JSON.parse(text); } 
    catch(e) { return res.status(500).json({ error: 'Réponse invalide: ' + text }); }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur upload' });
    }

    const fileUrl = (data.urls && data.urls.get) || data.url || '';
    console.log('File URL:', fileUrl);
    res.json({ url: fileUrl, id: data.id });

  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create prediction
app.post('/predict', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });

    const { version, input } = req.body;
    console.log('Creating prediction:', version, JSON.stringify(input));

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version, input })
    });

    const data = await response.json();
    console.log('Prediction:', data.id, data.status, data.error || '');

    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur' });
    }

    res.json(data);
  } catch (err) {
    console.error('Predict error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get prediction status
app.get('/predict/:id', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });

    const response = await fetch('https://api.replicate.com/v1/predictions/' + req.params.id, {
      headers: { 'Authorization': 'Token ' + apiKey }
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur' });
    }

    res.json(data);
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('LUMIX Backend v2 running on port', PORT);
});
