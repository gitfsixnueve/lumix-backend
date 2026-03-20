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
const TOPAZ_BASE = 'https://api.topazlabs.com/video/v1';

app.get('/', (req, res) => {
  res.json({ status: 'LUMIX Topaz Backend ✅', version: '8.0.0' });
});

// Full Topaz pipeline: create request → upload → complete → process
app.post('/process', upload.single('video'), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    console.log('=== TOPAZ PIPELINE START ===');
    console.log('File:', req.file.originalname, req.file.size, 'bytes');

    // Get video metadata from query params or use defaults
    const width = parseInt(req.body.width) || 1280;
    const height = parseInt(req.body.height) || 720;
    const frameRate = parseFloat(req.body.frameRate) || 30;
    const duration = parseFloat(req.body.duration) || 10;
    const frameCount = parseInt(req.body.frameCount) || Math.round(frameRate * duration);
    const mode = req.body.mode || 'fps120'; // fps120, upscale4k, both

    // STEP 1: Create enhancement request
    console.log('Step 1: Creating Topaz request...');
    
    const enhancements = [];
    
    if (mode === 'fps120' || mode === 'both') {
      enhancements.push({
        type: 'frameInterpolation',
        model: 'chr-2',
        parameters: {
          targetFrameRate: 120
        }
      });
    }
    
    if (mode === 'upscale4k' || mode === 'both') {
      enhancements.push({
        type: 'upscale',
        model: 'nyx-3',
        parameters: {
          scale: 4
        }
      });
    }

    if (enhancements.length === 0) {
      enhancements.push({
        type: 'upscale',
        model: 'nyx-3',
        parameters: { scale: 2 }
      });
    }

    const createBody = {
      source: {
        resolution: { width, height },
        container: 'mp4',
        size: req.file.size,
        duration: duration,
        frameRate: frameRate,
        frameCount: frameCount
      },
      output: {
        resolution: mode === 'upscale4k' || mode === 'both' ? 2160 : height,
        frameRate: mode === 'fps120' || mode === 'both' ? 120 : frameRate,
        container: 'mp4'
      },
      enhancements
    };

    console.log('Create body:', JSON.stringify(createBody, null, 2));

    const createResp = await fetch(`${TOPAZ_BASE}/process`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(createBody)
    });

    const createText = await createResp.text();
    console.log('Create response:', createText.substring(0, 500));

    let createData;
    try { createData = JSON.parse(createText); }
    catch(e) { return res.status(500).json({ error: 'Réponse invalide: ' + createText.substring(0, 200) }); }

    if (!createResp.ok) {
      return res.status(createResp.status).json({ error: createData.message || createData.error || JSON.stringify(createData) });
    }

    const requestId = createData.id || createData.requestId;
    console.log('Request ID:', requestId);

    // STEP 2: Accept the request to get upload URLs
    console.log('Step 2: Accepting request...');
    const acceptResp = await fetch(`${TOPAZ_BASE}/process/${requestId}/accept`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });

    const acceptText = await acceptResp.text();
    console.log('Accept response:', acceptText.substring(0, 500));

    let acceptData;
    try { acceptData = JSON.parse(acceptText); }
    catch(e) { return res.status(500).json({ error: 'Accept invalide: ' + acceptText.substring(0, 200) }); }

    if (!acceptResp.ok) {
      return res.status(acceptResp.status).json({ error: acceptData.message || JSON.stringify(acceptData) });
    }

    // Get upload URL(s)
    const uploadUrls = acceptData.uploadUrls || acceptData.urls || [acceptData.uploadUrl];
    console.log('Upload URLs:', uploadUrls);

    // STEP 3: Upload video to S3
    console.log('Step 3: Uploading to S3...');
    const uploadResp = await fetch(uploadUrls[0], {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: req.file.buffer
    });

    console.log('S3 upload status:', uploadResp.status);
    const eTag = uploadResp.headers.get('etag') || uploadResp.headers.get('ETag') || '""';
    console.log('ETag:', eTag);

    if (!uploadResp.ok) {
      return res.status(500).json({ error: 'Erreur upload S3: ' + uploadResp.status });
    }

    // STEP 4: Complete upload
    console.log('Step 4: Completing upload...');
    const completeBody = {
      uploadResults: [{ partNum: 1, eTag: eTag.replace(/"/g, '') }]
    };

    const completeResp = await fetch(`${TOPAZ_BASE}/process/${requestId}/complete-upload`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(completeBody)
    });

    const completeText = await completeResp.text();
    console.log('Complete response:', completeText.substring(0, 300));

    if (!completeResp.ok) {
      return res.status(completeResp.status).json({ error: 'Erreur complete: ' + completeText });
    }

    // Return the request ID so frontend can poll
    console.log('=== UPLOAD DONE — Processing started ===');
    res.json({ 
      requestId, 
      status: 'processing',
      message: 'Vidéo en cours de traitement par Topaz AI'
    });

  } catch (err) {
    console.error('Pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Poll Topaz job status
app.get('/status/:requestId', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'Clé API manquante' });

    const response = await fetch(`${TOPAZ_BASE}/process/${req.params.requestId}/status`, {
      headers: { 
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Status:', req.params.requestId, JSON.stringify(data).substring(0, 200));
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('LUMIX Topaz Backend running on port', PORT);
});
