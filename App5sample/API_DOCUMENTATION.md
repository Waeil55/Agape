# Agape Care - API Integration Guide

## 🔗 RESTful API Endpoints

### Base URL
```
Development: http://localhost:3001/api
Production: https://api.agapecare.com/api
```

---

## 🔐 Authentication Endpoints

### 1. User Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@agapecare.com",
  "password": "password123",
  "role": "driver|dispatcher|admin"
}

Response:
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@agapecare.com",
    "role": "driver",
    "name": "John Doe",
    "permissions": ["list", "of", "permissions"]
  },
  "expiresIn": 3600
}
```

### 2. Verify 2FA Code (Admin)
```
POST /auth/verify-2fa
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "123456"
}

Response:
{
  "success": true,
  "verified": true,
  "sessionToken": "new_session_token"
}
```

### 3. Refresh Token
```
POST /auth/refresh-token
Authorization: Bearer {refresh_token}

Response:
{
  "success": true,
  "token": "new_jwt_token",
  "expiresIn": 3600
}
```

### 4. User Logout
```
POST /auth/logout
Authorization: Bearer {token}

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 👥 User Management Endpoints

### 1. Get User Profile
```
GET /users/{userId}
Authorization: Bearer {token}

Response:
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@agapecare.com",
    "role": "driver",
    "name": "John Doe",
    "phone": "+1-555-0123",
    "profileImage": "url",
    "createdAt": "2024-05-13T00:00:00Z",
    "status": "active"
  }
}
```

### 2. Update User Profile
```
PUT /users/{userId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+1-555-0124",
  "language": "en"
}

Response:
{
  "success": true,
  "message": "Profile updated successfully",
  "user": { ...updated user data }
}
```

### 3. Change Password
```
POST /users/{userId}/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}

Response:
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## 🚗 Driver Endpoints

### 1. Get All Drivers
```
GET /drivers
Authorization: Bearer {token}
Query: ?status=available&limit=10&offset=0

Response:
{
  "success": true,
  "total": 45,
  "data": [
    {
      "id": "DRV-001",
      "name": "Alex Johnson",
      "status": "available",
      "vehicle": "Van #42",
      "currentZone": "Downtown Indy",
      "location": { "lat": 39.7684, "lng": -86.1581 },
      "odometer": 49850,
      "phone": "+1-555-0123"
    }
  ]
}
```

### 2. Get Driver Details
```
GET /drivers/{driverId}
Authorization: Bearer {token}

Response:
{
  "success": true,
  "driver": {
    "id": "DRV-001",
    "name": "Alex Johnson",
    "licenseNumber": "DL123456789",
    "licenseExpiry": "2025-12-31",
    "status": "available",
    "vehicle": "Van #42",
    "phone": "+1-555-0123",
    "email": "driver@agapecare.com",
    "currentZone": "Downtown Indy",
    "location": { "lat": 39.7684, "lng": -86.1581 },
    "odometer": 49850,
    "nextOilChange": 50000,
    "assignedDispatcher": "DSP-01",
    "performance": {
      "onTimeDeliveries": 234,
      "completedTasks": 245,
      "rating": 4.8,
      "safetyScore": 95
    },
    "schedule": [
      {
        "start": "08:00 AM",
        "end": "10:00 AM",
        "status": "busy",
        "task_id": "TASK-001"
      }
    ]
  }
}
```

### 3. Update Driver Status
```
PUT /drivers/{driverId}/status
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "available|on_trip|offline|maintenance"
}

Response:
{
  "success": true,
  "message": "Driver status updated",
  "newStatus": "available"
}
```

### 4. Update Driver Location
```
POST /drivers/{driverId}/location
Authorization: Bearer {token}
Content-Type: application/json

{
  "lat": 39.7684,
  "lng": -86.1581,
  "accuracy": 10,
  "timestamp": "2024-05-13T12:00:00Z"
}

Response:
{
  "success": true,
  "message": "Location updated successfully"
}
```

---

## 📋 Task Endpoints

### 1. Get All Tasks
```
GET /tasks
Authorization: Bearer {token}
Query: ?status=pending&assignedTo=DRV-001&limit=20&offset=0

Response:
{
  "success": true,
  "total": 120,
  "data": [
    {
      "id": "TASK-001",
      "title": "Deliver Package",
      "description": "Package delivery to downtown",
      "status": "assigned",
      "priority": "high",
      "assignedTo": "DRV-001",
      "createdAt": "2024-05-13T08:00:00Z",
      "dueDate": "2024-05-13T17:00:00Z",
      "route": {
        "startLocation": { "address": "123 Main St" },
        "endLocation": { "address": "456 Oak Ave" },
        "distance": 12.5,
        "estimatedDuration": 35
      }
    }
  ]
}
```

### 2. Create New Task
```
POST /tasks
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Deliver Package",
  "description": "Package delivery",
  "priority": "high",
  "dueDate": "2024-05-13T17:00:00Z",
  "route": {
    "startLocation": {
      "address": "123 Main St",
      "lat": 39.7684,
      "lng": -86.1581
    },
    "endLocation": {
      "address": "456 Oak Ave",
      "lat": 39.7750,
      "lng": -86.1583
    }
  },
  "deliveryInfo": {
    "recipientName": "Jane Smith",
    "recipientPhone": "+1-555-0999",
    "packages": 1,
    "weight": 5.5
  }
}

Response:
{
  "success": true,
  "taskId": "TASK-001",
  "message": "Task created successfully"
}
```

### 3. Assign Task to Driver
```
POST /tasks/{taskId}/assign
Authorization: Bearer {token}
Content-Type: application/json

{
  "driverId": "DRV-001",
  "optimizeRoute": true
}

Response:
{
  "success": true,
  "message": "Task assigned to driver",
  "optimizedRoute": {
    "distance": 12.5,
    "estimatedDuration": 35,
    "waypoints": [...]
  }
}
```

### 4. Update Task Status
```
PUT /tasks/{taskId}/status
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "in_progress|completed|cancelled"
}

Response:
{
  "success": true,
  "message": "Task status updated",
  "task": { ...updated task }
}
```

### 5. Complete Task with Proof
```
POST /tasks/{taskId}/complete
Authorization: Bearer {token}
Content-Type: multipart/form-data

{
  "proofOfDelivery": "image.jpg",
  "recipientSignature": "signature.jpg",
  "notes": "Delivered safely"
}

Response:
{
  "success": true,
  "message": "Task completed successfully",
  "completedAt": "2024-05-13T14:30:00Z"
}
```

---

## 🚙 Vehicle Endpoints

### 1. Get All Vehicles
```
GET /vehicles
Authorization: Bearer {token}
Query: ?status=available&type=van

Response:
{
  "success": true,
  "total": 50,
  "data": [
    {
      "id": "VEH-001",
      "name": "Van #42",
      "type": "van",
      "vin": "1HGCM82633A004352",
      "licensePlate": "ABC-1234",
      "status": "available",
      "currentOdometer": 49850,
      "nextServiceDate": "2024-06-13",
      "location": { "lat": 39.7684, "lng": -86.1581 }
    }
  ]
}
```

### 2. Get Vehicle Details
```
GET /vehicles/{vehicleId}
Authorization: Bearer {token}

Response:
{
  "success": true,
  "vehicle": {
    "id": "VEH-001",
    "name": "Van #42",
    "type": "van",
    "vin": "1HGCM82633A004352",
    "make": "Honda",
    "model": "Odyssey",
    "year": 2022,
    "licensePlate": "ABC-1234",
    "status": "available",
    "currentOdometer": 49850,
    "mileageCapacity": 200000,
    "lastServiceDate": "2024-04-13",
    "nextServiceDate": "2024-06-13",
    "specifications": {
      "seatingCapacity": 7,
      "loadCapacity": 1500,
      "fuelType": "gasoline",
      "transmission": "automatic"
    },
    "insurance": {
      "provider": "State Farm",
      "policyNumber": "SF123456",
      "expiryDate": "2025-05-13"
    }
  }
}
```

### 3. Update Vehicle Maintenance
```
PUT /vehicles/{vehicleId}/maintenance
Authorization: Bearer {token}
Content-Type: application/json

{
  "serviceDate": "2024-05-13",
  "type": "oil_change",
  "cost": 75.50,
  "mileage": 49850,
  "notes": "Regular maintenance"
}

Response:
{
  "success": true,
  "message": "Maintenance record added"
}
```

---

## 📊 Analytics & Reporting Endpoints

### 1. Get Dashboard Statistics
```
GET /analytics/dashboard
Authorization: Bearer {token}
Query: ?dateRange=7days&region=all

Response:
{
  "success": true,
  "statistics": {
    "totalDeliveries": 450,
    "completedDeliveries": 445,
    "pendingDeliveries": 5,
    "avgDeliveryTime": 32,
    "successRate": 98.9,
    "activeDrivers": 25,
    "availableVehicles": 18,
    "totalDistance": 5430.5,
    "revenue": 12500
  }
}
```

### 2. Get Driver Performance Report
```
GET /analytics/drivers/{driverId}
Authorization: Bearer {token}
Query: ?dateRange=30days

Response:
{
  "success": true,
  "report": {
    "driverId": "DRV-001",
    "name": "Alex Johnson",
    "totalDeliveries": 65,
    "successRate": 98.5,
    "avgDeliveryTime": 31,
    "totalDistance": 1245.5,
    "safetyScore": 96,
    "rating": 4.8,
    "earnings": 1950
  }
}
```

### 3. Get System Health Report
```
GET /analytics/system-health
Authorization: Bearer {token}

Response:
{
  "success": true,
  "health": {
    "apiStatus": "operational",
    "databaseStatus": "operational",
    "storageStatus": "operational",
    "systemUptime": 99.99,
    "activeUsers": 125,
    "activeDrivers": 28,
    "queuedTasks": 45,
    "failedOperations": 2
  }
}
```

---

## 🤖 AI & Optimization Endpoints

### 1. Optimize Route
```
POST /ai/optimize-route
Authorization: Bearer {token}
Content-Type: application/json

{
  "driverId": "DRV-001",
  "tasks": ["TASK-001", "TASK-002", "TASK-003"],
  "considerTraffic": true
}

Response:
{
  "success": true,
  "optimizedRoute": {
    "order": ["TASK-001", "TASK-003", "TASK-002"],
    "totalDistance": 28.5,
    "totalDuration": 145,
    "estimatedCost": 12.50,
    "savings": "15%"
  }
}
```

### 2. Smart Task Assignment
```
POST /ai/assign-tasks
Authorization: Bearer {token}
Content-Type: application/json

{
  "tasks": ["TASK-001", "TASK-002"],
  "availableDrivers": ["DRV-001", "DRV-002", "DRV-003"],
  "optimizeFor": "time|distance|cost"
}

Response:
{
  "success": true,
  "assignments": [
    {
      "taskId": "TASK-001",
      "assignedTo": "DRV-001",
      "estimatedTime": 35,
      "confidence": 0.95
    }
  ]
}
```

---

## 🔔 Notification Endpoints

### 1. Send Notification
```
POST /notifications/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "userId": "user_id",
  "title": "New Task Assigned",
  "message": "You have a new delivery task",
  "type": "task_assignment",
  "priority": "high"
}

Response:
{
  "success": true,
  "notificationId": "NOTIF-001"
}
```

### 2. Get User Notifications
```
GET /notifications
Authorization: Bearer {token}
Query: ?limit=20&offset=0&unreadOnly=false

Response:
{
  "success": true,
  "total": 45,
  "unreadCount": 3,
  "notifications": [
    {
      "id": "NOTIF-001",
      "title": "New Task Assigned",
      "message": "You have a new delivery task",
      "type": "task_assignment",
      "priority": "high",
      "read": false,
      "createdAt": "2024-05-13T12:00:00Z"
    }
  ]
}
```

---

## Error Response Format

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "statusCode": 400
}
```

### Common Error Codes:
- `401` - Unauthorized (Invalid or expired token)
- `403` - Forbidden (Insufficient permissions)
- `404` - Not Found (Resource doesn't exist)
- `422` - Validation Error (Invalid input)
- `500` - Internal Server Error

---

## 🔐 Authentication Headers

All requests (except login) must include:

```
Authorization: Bearer {jwt_token}
```

---

## 📡 Rate Limiting

- **Free Tier**: 1000 requests/hour
- **Business Tier**: 10,000 requests/hour
- **Enterprise**: Unlimited

---

## 📚 SDK Examples

### JavaScript/React
```javascript
import axios from 'axios';

const API_BASE_URL = process.env.VITE_API_BASE_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Example: Get drivers
const getDrivers = async () => {
  try {
    const response = await api.get('/drivers', {
      params: { status: 'available' }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching drivers:', error);
    throw error;
  }
};
```

---

This API documentation provides comprehensive endpoints for the Agape Care fleet management system.
