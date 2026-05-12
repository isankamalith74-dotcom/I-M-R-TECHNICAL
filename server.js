// server.js - Twilio WhatsApp/SMS OTP Backend
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Twilio Client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const TWILIO_SMS_NUMBER = process.env.TWILIO_SMS_NUMBER || '+1234567890';

// In-memory store (use Redis in production)
const otpStore = new Map();
const verifiedUsers = new Map();

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via WhatsApp
app.post('/api/send-otp-whatsapp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        // Format number (add + if not present)
        let formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP
        otpStore.set(formattedNumber, { otp, expiresAt, attempts: 0 });

        // Send WhatsApp message
        const message = await client.messages.create({
            body: `🔐 NEXORA X Verification Code\n\nYour OTP is: *${otp}*\n\nThis code will expire in 5 minutes. Do not share this code with anyone.`,
            from: TWILIO_WHATSAPP_NUMBER,
            to: `whatsapp:${formattedNumber}`
        });

        console.log(`OTP sent to ${formattedNumber}: ${otp}`);

        res.json({ 
            success: true, 
            message: 'OTP sent successfully',
            sid: message.sid 
        });

    } catch (error) {
        console.error('Twilio Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP',
            error: error.message 
        });
    }
});

// Send OTP via SMS
app.post('/api/send-otp-sms', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        let formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;

        const otp = generateOTP();
        const expiresAt = Date.now() + 5 * 60 * 1000;

        otpStore.set(formattedNumber, { otp, expiresAt, attempts: 0 });

        const message = await client.messages.create({
            body: `NEXORA X: Your verification code is ${otp}. Valid for 5 minutes.`,
            from: TWILIO_SMS_NUMBER,
            to: formattedNumber
        });

        console.log(`SMS OTP sent to ${formattedNumber}: ${otp}`);

        res.json({ 
            success: true, 
            message: 'OTP sent via SMS',
            sid: message.sid 
        });

    } catch (error) {
        console.error('Twilio SMS Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send SMS',
            error: error.message 
        });
    }
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({ success: false, message: 'Phone number and OTP required' });
        }

        let formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;
        const storedData = otpStore.get(formattedNumber);

        if (!storedData) {
            return res.status(400).json({ success: false, message: 'OTP not found or expired' });
        }

        // Check expiry
        if (Date.now() > storedData.expiresAt) {
            otpStore.delete(formattedNumber);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        // Check max attempts
        if (storedData.attempts >= 3) {
            otpStore.delete(formattedNumber);
            return res.status(400).json({ success: false, message: 'Too many attempts. Request new OTP.' });
        }

        // Verify
        if (storedData.otp === otp) {
            otpStore.delete(formattedNumber);
            verifiedUsers.set(formattedNumber, { verifiedAt: Date.now() });

            return res.json({ 
                success: true, 
                message: 'Verification successful',
                token: generateToken(formattedNumber)
            });
        } else {
            storedData.attempts += 1;
            return res.status(400).json({ 
                success: false, 
                message: `Invalid OTP. ${3 - storedData.attempts} attempts remaining.` 
            });
        }

    } catch (error) {
        console.error('Verify Error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// Simple token generator (use JWT in production)
function generateToken(phone) {
    return Buffer.from(`${phone}:${Date.now()}`).toString('base64');
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', service: 'NEXORA X Auth' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 NEXORA X Auth Server running on port ${PORT}`);
});
