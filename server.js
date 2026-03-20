const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 500 * 1024 * 1024 } 
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'LUMIX Backend v4 ✅', version: '4.0.0' });
});

// Upload video via transfer.sh (no account needed)
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    console.log('File received:', req.file.size, 'bytes');

    // Upload to transfer.sh — free, no account, gives public URL
    const response = await fetch('https://transfer.sh/video.mp4', {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Max-Downloads': '10',
        'Max-Days': '1'
      },
      body: req.file.buffer
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('transfer.sh error:', text);
      return res.status(500).json({ error: 'Erreur upload: ' + text });
    }

    const videoUrl = await response.text();
    console.log('Video URL:', videoUrl.trim());
    res.json({ url: videoUrl.trim() });

  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create Replicate prediction
app.post('/predict', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });

    const { version, input } = req.body;
    console.log('Creating prediction:', version);
    console.log('Input video URL:', input.video || input.video_path);

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
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur Replicate' });
    }

    res.json(data);
  } catch (err) {
    console.error('Predict error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Poll prediction
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
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('LUMIX Backend v4 running on port', PORT);
});
