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
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dynwd3bng';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'lumix_unsigned';

app.get('/', (req, res) => {
  res.json({ status: 'LUMIX Backend v6 ✅', cloud: CLOUD_NAME });
});

// Upload to Cloudinary
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    console.log('File received:', req.file.size, 'bytes', req.file.mimetype);

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: 'video.mp4',
      contentType: 'video/mp4'
    });
    form.append('upload_preset', UPLOAD_PRESET);
    form.append('resource_type', 'video');

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;
    console.log('Uploading to:', url);

    const response = await fetch(url, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const text = await response.text();
    console.log('Cloudinary raw response:', text.substring(0, 200));

    let data;
    try { data = JSON.parse(text); }
    catch(e) { return res.status(500).json({ error: 'Réponse invalide Cloudinary: ' + text.substring(0, 100) }); }

    if (!response.ok || data.error) {
      return res.status(500).json({ error: 'Cloudinary: ' + (data.error?.message || JSON.stringify(data)) });
    }

    const videoUrl = data.secure_url;
    console.log('Video URL:', videoUrl);
    res.json({ url: videoUrl });

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
    console.log('Prediction input:', JSON.stringify(input));

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
  console.log('LUMIX Backend v6 running on port', PORT);
});
