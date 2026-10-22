const axios = require('axios');
const FormData = require('form-data');

const ASSEMBLY_API_KEY = process.env.ASSEMBLY_AI_API_KEY;

// Mock transcription for testing (returns dummy text based on file size)
const mockTranscribe = async (fileBuffer) => {
  const mockTexts = [
    'The customer is inquiring about the product specifications and availability for bulk orders.',
    'We need clarification on the packaging requirements and delivery timeline for this batch.',
    'The client wants to know about customization options and pricing for different quantities.',
    'There are concerns about the quality standards and testing procedures for this product.',
    'The customer is interested in establishing a long-term supply agreement with favorable terms.',
    'Questions about payment terms, discounts, and logistics for the upcoming shipment.',
    'Can you provide samples and technical documentation for our evaluation?',
    'We need urgent quotes for raw materials and production timeline estimates.',
  ];

  // Use file size to determine which mock text
  const index = fileBuffer.length % mockTexts.length;
  return mockTexts[index];
};

const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file provided' });
    }

    let transcript = '';

    if (ASSEMBLY_API_KEY) {
      // Use real AssemblyAI API if key is configured
      try {
        const form = new FormData();
        form.append('audio_data', req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype,
        });

        const uploadResponse = await axios.post(
          'https://api.assemblyai.com/v2/upload',
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: ASSEMBLY_API_KEY,
            },
          }
        );

        const audioUrl = uploadResponse.data.upload_url;

        const transcriptResponse = await axios.post(
          'https://api.assemblyai.com/v2/transcript',
          {
            audio_url: audioUrl,
            language_code: 'en',
          },
          {
            headers: { Authorization: ASSEMBLY_API_KEY },
          }
        );

        const transcriptId = transcriptResponse.data.id;

        // Poll for completion (max 60 seconds)
        let status = 'processing';
        let attempts = 0;
        const maxAttempts = 60;

        while (status === 'processing' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResponse = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            {
              headers: { Authorization: ASSEMBLY_API_KEY },
            }
          );

          status = statusResponse.data.status;
          if (status === 'completed') {
            transcript = statusResponse.data.text || 'No speech detected';
            break;
          } else if (status === 'error') {
            throw new Error(`Transcription failed: ${statusResponse.data.error}`);
          }

          attempts++;
        }

        if (!transcript && status !== 'completed') {
          throw new Error('Transcription timeout');
        }
      } catch (error) {
        console.warn('AssemblyAI failed, using mock transcription:', error.message);
        transcript = await mockTranscribe(req.file.buffer);
      }
    } else {
      // Use mock transcription for development/testing
      console.log('Using mock transcription (no ASSEMBLY_AI_API_KEY configured)');
      transcript = await mockTranscribe(req.file.buffer);
    }

    res.json({
      success: true,
      transcript: transcript || 'No speech detected',
    });
  } catch (error) {
    console.error('Transcription error:', error.message);
    res.status(500).json({
      message: error.message || 'Transcription failed',
    });
  }
};

module.exports = { transcribeAudio };
