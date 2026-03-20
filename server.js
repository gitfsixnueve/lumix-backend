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
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'lumix_unsigned';

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'LUMIX Backend v3 ✅', version: '3.0.0' });
});

// Upload video to Cloudinary then send URL to Replicate
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    console.log('File received:', req.file.originalname, req.file.size, 'bytes');

    // Step 1: Upload to Cloudinary
    console.log('Uploading to Cloudinary...');
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: 'video.mp4',
      contentType: 'video/mp4'
    });
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('resource_type', 'video');

    const cloudResp = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`,
      { method: 'POST', body: formData }
    );

    const cloudData = await cloudResp.json();
    console.log('Cloudinary response:', cloudData.secure_url || cloudData.error);

    if (!cloudResp.ok || cloudData.error) {
      return res.status(500).json({ error: 'Erreur Cloudinary: ' + (cloudData.error?.message || 'upload failed') });
    }

    const videoUrl = cloudData.secure_url;
    console.log('Video URL:', videoUrl);
    res.json({ url: videoUrl, id: cloudData.public_id });

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
    console.log('Input:', JSON.stringify(input));

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version, input })
    });

    const data = await response.json();
    console.log('Prediction created:', data.id, data.status, data.error || '');

    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur Replicate' });
    }

    res.json(data);
  } catch (err) {
    console.error('Predict error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Poll prediction status
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
  console.log('LUMIX Backend v3 running on port', PORT);
});
