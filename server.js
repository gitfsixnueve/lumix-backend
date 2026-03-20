const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
 
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
 
app.use(cors());
app.use(express.json({ limit: '10mb' }));
 
const PORT = process.env.PORT || 3000;
const REPLICATE_KEY = process.env.REPLICATE_API_KEY;
 
// Health check
app.get('/', (req, res) => {
  res.json({ status: 'LUMIX Backend running ✅', version: '1.0.0' });
});
 
// Upload video to Replicate
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || REPLICATE_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
    if (!req.file) return res.status(400).json({ error: 'Fichier vidéo manquant' });
 
    console.log('Uploading file:', req.file.originalname, req.file.size, 'bytes');
 
    const response = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': req.file.mimetype || 'video/mp4',
        'Content-Disposition': 'attachment; filename="video.mp4"'
      },
      body: req.file.buffer
    });
 
    const data = await response.json();
    console.log('Upload response:', data);
 
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur upload' });
    }
 
    const fileUrl = (data.urls && data.urls.get) || data.url || '';
    res.json({ url: fileUrl, id: data.id });
 
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
// Create prediction
app.post('/predict', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || REPLICATE_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
 
    const { version, input } = req.body;
    if (!version || !input) return res.status(400).json({ error: 'version et input requis' });
 
    console.log('Creating prediction:', version);
 
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version, input })
    });
 
    const data = await response.json();
    console.log('Prediction created:', data.id, data.status);
 
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur prediction' });
    }
 
    res.json(data);
 
  } catch (err) {
    console.error('Predict error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
// Get prediction status
app.get('/predict/:id', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || REPLICATE_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
 
    const response = await fetch('https://api.replicate.com/v1/predictions/' + req.params.id, {
      headers: { 'Authorization': 'Token ' + apiKey }
    });
 
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Erreur status' });
    }
 
    res.json(data);
 
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
app.listen(PORT, () => {
  console.log('LUMIX Backend running on port', PORT);
});
