# Agape Care - Authentication & API Setup Guide

## Overview
This application features role-based authentication with separate login flows for Drivers, Dispatchers, and Admins. All authentication and data is managed through Firebase.

---

## 🔐 Authentication System

### Three Role-Based Login Interfaces:

#### 1. **DRIVER LOGIN** (Amber Theme)
- **Color Scheme**: Amber (#b45309)
- **Requirements**:
  - CDL License Number (DL123456789)
  - Email Address
  - Password
  - Remember Device Option
- **Permissions**: Route navigation, task management, vehicle status
- **Features**:
  - Simple, mobile-friendly interface
  - Offline capability support
  - Real-time GPS tracking

#### 2. **DISPATCHER LOGIN** (Emerald Theme)
- **Color Scheme**: Emerald (#059669)
- **Requirements**:
  - Company/Team ID (AGAPE-2024)
  - Business Email
  - Password
  - Two-Factor Authentication Option
- **Permissions**: Task assignment, fleet tracking, driver management
- **Features**:
  - Advanced task assignment
  - Route optimization
  - Real-time fleet monitoring

#### 3. **ADMIN LOGIN** (Blue Theme)
- **Color Scheme**: Blue (#2563eb)
- **Requirements**:
  - Admin Email
  - Password
  - 6-Digit Security Code (via email)
- **Permissions**: Full system access, user management, system configuration
- **Features**:
  - Enhanced security with 2FA
  - System-wide analytics
  - User and billing management
  - Activity logging

---

## 🔥 Firebase Integration

### Project Credentials:
```
Project Name: Agape
Project ID: agape-95c9f
Project Number: 566470518829
Support Email: waeil.usa@gmail.com
```

### Firebase Services Enabled:
- ✅ Authentication (Email/Password + Phone)
- ✅ Realtime Database
- ✅ Cloud Storage
- ✅ Cloud Messaging
- ✅ Analytics

### Configuration File Location:
`src/config/firebase.js`

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyCbnAFOg_NpCHEvZlP33p_fGJT-Fu69kSM",
  authDomain: "agape-95c9f.firebaseapp.com",
  databaseURL: "https://agape-95c9f-default-rtdb.firebaseio.com",
  projectId: "agape-95c9f",
  storageBucket: "agape-95c9f.firebasestorage.app",
  messagingSenderId: "566470518829",
  appId: "1:566470518829:web:6233c914f2aa13aa6af0a4",
  measurementId: "G-6ZW1RLCVRQ"
};
```

---

## 🗺️ Google Maps Integration

### API Key:
```
AIzaSyAodry_zIOQgZsPUAyamUoT_U0Nvp2OAko
```

### Enabled Features:
- Maps JavaScript API
- Roads API
- Places API
- Directions API
- Distance Matrix API

### Usage:
```javascript
import { GOOGLE_MAPS_API_KEY } from './config/firebase';

// Load Google Maps in your component
const loadGoogleMaps = () => {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
  document.head.appendChild(script);
};
```

---

## 🤖 Gemini AI Integration

### Project Details:
```
Project ID: gen-lang-client-0828587071
API Key: AIzaSyAodry_zIOQgZsPUAyamUoT_U0Nvp2OAko
```

### Capabilities:
- Route optimization using AI
- Smart task assignment
- Natural language processing for driver communication
- Predictive maintenance alerts
- Fleet analytics

### Setup:
```bash
npm install @google/generative-ai
```

### Example Usage:
```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const response = await model.generateContent("Optimize this route...");
```

---

## 📦 Environment Variables

### `.env` File
All credentials are stored in the `.env` file:

```env
# Firebase
VITE_FIREBASE_API_KEY=AIzaSyCbnAFOg_NpCHEvZlP33p_fGJT-Fu69kSM
VITE_FIREBASE_AUTH_DOMAIN=agape-95c9f.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://agape-95c9f-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=agape-95c9f
VITE_FIREBASE_STORAGE_BUCKET=agape-95c9f.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=566470518829
VITE_FIREBASE_APP_ID=1:566470518829:web:6233c914f2aa13aa6af0a4
VITE_FIREBASE_MEASUREMENT_ID=G-6ZW1RLCVRQ

# Google APIs
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAodry_zIOQgZsPUAyamUoT_U0Nvp2OAko
VITE_GEMINI_PROJECT_ID=gen-lang-client-0828587071
VITE_GEMINI_API_KEY=AIzaSyAodry_zIOQgZsPUAyamUoT_U0Nvp2OAko

# Application
VITE_API_BASE_URL=http://localhost:3001
VITE_SUPPORT_EMAIL=waeil.usa@gmail.com
```

### Production vs Development
- **Development**: `.env.development`
- **Production**: `.env.production`

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Test Login Flows

#### Driver Login:
- License: `DL123456789`
- Email: `driver@agapecare.com`
- Password: `password123`

#### Dispatcher Login:
- Company ID: `AGAPE-2024`
- Email: `dispatcher@agapecare.com`
- Password: `password123`

#### Admin Login:
- Email: `admin@agapecare.com`
- Password: `password123`
- Security Code: `123456`

---

## 📱 Component Structure

### Authentication Components:
```
src/components/
├── RoleSelection.jsx       # Initial role selection screen
├── DriverLogin.jsx         # Driver login form
├── DispatcherLogin.jsx     # Dispatcher login form
└── AdminLogin.jsx          # Admin login with 2FA
```

### Configuration:
```
src/config/
└── firebase.js            # All API keys and config
```

---

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit `.env` file to version control
2. **Firebase Rules**: Set up proper Firestore security rules
3. **2FA**: Enforce 2FA for admin accounts
4. **API Keys**: Rotate API keys regularly
5. **HTTPS**: Always use HTTPS in production
6. **Session Timeout**: Implement automatic logout after inactivity

---

## 📊 Data Structure

### User Document (Firebase):
```json
{
  "uid": "user_id",
  "email": "user@agapecare.com",
  "role": "driver|dispatcher|admin",
  "name": "User Name",
  "createdAt": "2024-05-13",
  "lastLogin": "2024-05-13",
  "status": "active|inactive",
  "permissions": ["list", "of", "permissions"],
  "licenseNumber": "DL123456789"
}
```

### Driver Document:
```json
{
  "driverId": "DRV-001",
  "name": "Alex Johnson",
  "licenseNumber": "DL123456789",
  "vehicle": "Van #42",
  "status": "available|on_trip|offline",
  "location": { "lat": 39.7684, "lng": -86.1581 },
  "odometer": 49850,
  "phone": "+1-555-0123"
}
```

---

## 🛠️ Backend API Endpoints

### Authentication:
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/verify-2fa` - Verify 2FA code
- `POST /api/auth/refresh-token` - Refresh auth token

### Drivers:
- `GET /api/drivers` - List all drivers
- `GET /api/drivers/:id` - Get driver details
- `PUT /api/drivers/:id` - Update driver info
- `POST /api/drivers/:id/location` - Update GPS location

### Tasks:
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `POST /api/tasks/:id/assign` - Assign task to driver

---

## 📞 Support

For issues or questions:
- **Email**: waeil.usa@gmail.com
- **Support Line**: 1-800-AGAPE-1

---

## 📄 License

© 2024 Agape Care. All rights reserved.
