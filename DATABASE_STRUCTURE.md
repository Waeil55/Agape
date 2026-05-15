# Agape Care - Database & Storage Structure

## 📊 Firebase Realtime Database Structure

```
agape-95c9f/
│
├── users/
│   ├── {userId}
│   │   ├── uid: "string"
│   │   ├── email: "string"
│   │   ├── role: "admin|dispatcher|driver"
│   │   ├── name: "string"
│   │   ├── createdAt: "timestamp"
│   │   ├── lastLogin: "timestamp"
│   │   ├── status: "active|inactive|suspended"
│   │   ├── permissions: ["array", "of", "permissions"]
│   │   ├── metadata: {
│   │   │   ├── phone: "string",
│   │   │   ├── department: "string",
│   │   │   ├── assignedTeam: "string"
│   │   │   └── profileImage: "url"
│   │   └── settings: {
│   │       ├── notifications: boolean,
│   │       ├── emailAlerts: boolean,
│   │       └── language: "string"
│   │
│
├── drivers/
│   ├── {driverId}
│   │   ├── id: "DRV-001"
│   │   ├── userId: "string" (reference to users)
│   │   ├── name: "string"
│   │   ├── licenseNumber: "string"
│   │   ├── licenseExpiry: "date"
│   │   ├── status: "available|on_trip|offline|maintenance"
│   │   ├── vehicle: "string"
│   │   ├── phone: "string"
│   │   ├── email: "string"
│   │   ├── currentZone: "string"
│   │   ├── location: {
│   │   │   ├── lat: "number",
│   │   │   ├── lng: "number",
│   │   │   ├── accuracy: "number",
│   │   │   └── timestamp: "timestamp"
│   │   │
│   │   ├── vehicle_info: {
│   │   │   ├── vin: "string",
│   │   │   ├── make: "string",
│   │   │   ├── model: "string",
│   │   │   ├── year: "number",
│   │   │   ├── odometer: "number",
│   │   │   ├── nextOilChange: "number",
│   │   │   ├── inspectionDate: "date",
│   │   │   └── registrationExpiry: "date"
│   │   │
│   │   ├── schedule: [
│   │   │   {
│   │   │     "start": "08:00 AM",
│   │   │     "end": "10:00 AM",
│   │   │     "status": "busy|free",
│   │   │     "task_id": "string"
│   │   │   }
│   │   │]
│   │   │
│   │   ├── performance: {
│   │   │   ├── onTimeDeliveries: "number",
│   │   │   ├── completedTasks: "number",
│   │   │   ├── rating: "number",
│   │   │   ├── safetyScore: "number",
│   │   │   └── totalMiles: "number"
│   │   │
│   │   └── assignedDispatcher: "DSP-01"
│   │
│
├── dispatchers/
│   ├── {dispatcherId}
│   │   ├── id: "DSP-01"
│   │   ├── userId: "string" (reference to users)
│   │   ├── name: "string"
│   │   ├── email: "string"
│   │   ├── companyId: "string"
│   │   ├── team: "string"
│   │   ├── status: "online|offline|on_break"
│   │   ├── permissions: ["array", "of", "permissions"]
│   │   ├── assignedDrivers: ["DRV-001", "DRV-002", "DRV-003"]
│   │   ├── statistics: {
│   │   │   ├── tasksAssigned: "number",
│   │   │   ├── tasksCompleted: "number",
│   │   │   └── avgRouteOptimization: "number"
│   │   │
│   │   └── workingHours: {
│   │       ├── startTime: "string",
│   │       ├── endTime: "string",
│   │       └── timezone: "string"
│   │
│
├── tasks/
│   ├── {taskId}
│   │   ├── id: "TASK-001"
│   │   ├── title: "string"
│   │   ├── description: "string"
│   │   ├── status: "pending|assigned|in_progress|completed|cancelled"
│   │   ├── priority: "low|medium|high|critical"
│   │   ├── createdBy: "dispatcher_id"
│   │   ├── assignedTo: "driver_id"
│   │   ├── createdAt: "timestamp"
│   │   ├── dueDate: "date"
│   │   ├── completedAt: "timestamp"
│   │   ├── route: {
│   │   │   ├── startLocation: {
│   │   │   │   ├── address: "string",
│   │   │   │   ├── lat: "number",
│   │   │   │   └── lng: "number"
│   │   │   │
│   │   │   ├── endLocation: {
│   │   │   │   ├── address: "string",
│   │   │   │   ├── lat: "number",
│   │   │   │   └── lng: "number"
│   │   │   │
│   │   │   ├── waypoints: ["array", "of", "locations"],
│   │   │   ├── distance: "number",
│   │   │   ├── estimatedDuration: "number",
│   │   │   └── actualDuration: "number"
│   │   │
│   │   ├── deliveryInfo: {
│   │   │   ├── recipientName: "string",
│   │   │   ├── recipientPhone: "string",
│   │   │   ├── packages: "number",
│   │   │   ├── weight: "number",
│   │   │   ├── specialInstructions: "string",
│   │   │   └── proofOfDelivery: "url"
│   │   │
│   │   └── notes: [
│   │       {
│   │         "author": "string",
│   │         "text": "string",
│   │         "timestamp": "timestamp"
│   │       }
│   │   ]
│   │
│
├── vehicles/
│   ├── {vehicleId}
│   │   ├── id: "VEH-001"
│   │   ├── name: "Van #42"
│   │   ├── type: "van|truck|car|motorcycle"
│   │   ├── vin: "string"
│   │   ├── make: "string"
│   │   ├── model: "string"
│   │   ├── year: "number"
│   │   ├── licensePlate: "string"
│   │   ├── status: "available|in_use|maintenance|retired"
│   │   ├── currentOdometer: "number"
│   │   ├── mileageCapacity: "number"
│   │   ├── lastServiceDate: "date"
│   │   ├── nextServiceDate: "date"
│   │   ├── insurance: {
│   │   │   ├── provider: "string",
│   │   │   ├── policyNumber: "string",
│   │   │   └── expiryDate: "date"
│   │   │
│   │   ├── location: {
│   │   │   ├── lat: "number",
│   │   │   ├── lng: "number",
│   │   │   └── timestamp: "timestamp"
│   │   │
│   │   ├── specifications: {
│   │   │   ├── seatingCapacity: "number",
│   │   │   ├── loadCapacity: "number",
│   │   │   ├── fuelType: "string",
│   │   │   └── transmission: "string"
│   │   │
│   │   └── maintenanceHistory: [
│   │       {
│   │         "date": "date",
│   │         "type": "string",
│   │         "cost": "number",
│   │         "notes": "string"
│   │       }
│   │   ]
│   │
│
├── teams/
│   ├── {teamId}
│   │   ├── id: "TEAM-01"
│   │   ├── name: "North Team"
│   │   ├── region: "string"
│   │   ├── members: ["DSP-01", "DRV-001", "DRV-002"]
│   │   ├── manager: "user_id"
│   │   ├── createdAt: "timestamp"
│   │   └── statistics: {
│   │       ├── totalDeliveries: "number",
│   │       ├── successRate: "number",
│   │       └── avgDeliveryTime: "number"
│   │
│
├── systemLogs/
│   ├── {logId}
│   │   ├── id: "LOG-001"
│   │   ├── type: "system|user|error|warning"
│   │   ├── title: "string"
│   │   ├── description: "string"
│   │   ├── severity: "low|medium|high|critical"
│   │   ├── userId: "string" (if user-related)
│   │   ├── driverId: "string" (if driver-related)
│   │   ├── timestamp: "timestamp"
│   │   └── metadata: {}
│   │
│
├── settings/
│   ├── app/
│   │   ├── version: "1.0.0"
│   │   ├── maintenanceMode: boolean
│   │   ├── features: {
│   │   │   ├── offlineMode: boolean,
│   │   │   ├── gpTracking: boolean,
│   │   │   └── aiOptimization: boolean
│   │   │
│   │   └── notification_settings: {}
│   │
│   └── company/
│       ├── name: "Agape Care"
│       ├── supportEmail: "waeil.usa@gmail.com"
│       ├── supportPhone: "1-800-AGAPE-1"
│       └── timezone: "America/Indiana/Indianapolis"
```

---

## 💾 Firebase Cloud Storage Structure

```
agape-95c9f/
│
├── profile-images/
│   ├── users/
│   │   └── {userId}/
│   │       └── avatar.jpg
│   │
│   └── drivers/
│       └── {driverId}/
│           └── license.pdf
│
├── vehicle-documents/
│   ├── {vehicleId}/
│   │   ├── registration.pdf
│   │   ├── insurance.pdf
│   │   └── inspection_report.pdf
│
├── deliveries/
│   ├── {taskId}/
│   │   ├── proof_of_delivery.jpg
│   │   ├── signature.jpg
│   │   └── photos/
│   │       └── {photo_name}.jpg
│
├── reports/
│   ├── daily/
│   │   └── {date}.pdf
│   │
│   ├── monthly/
│   │   └── {month}.pdf
│   │
│   └── annual/
│       └── {year}.pdf
│
└── analytics/
    └── {report_id}.csv
```

---

## 🔐 Firestore Security Rules

```javascript
// Basic security rules for Agape Care
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection
    match /users/{userId} {
      allow read: if request.auth.uid == userId || 
                     request.auth.token.role == 'admin';
      allow write: if request.auth.uid == userId ||
                      request.auth.token.role == 'admin';
    }
    
    // Drivers collection
    match /drivers/{driverId} {
      allow read: if request.auth.token.role == 'admin' ||
                     request.auth.token.role == 'dispatcher' ||
                     request.auth.uid == resource.data.userId;
      allow write: if request.auth.token.role == 'admin';
    }
    
    // Tasks collection
    match /tasks/{taskId} {
      allow read: if request.auth.token.role == 'admin' ||
                     request.auth.token.role == 'dispatcher' ||
                     request.auth.uid == resource.data.userId;
      allow write: if request.auth.token.role == 'admin' ||
                      request.auth.token.role == 'dispatcher';
    }
  }
}
```

---

## 📝 Indexes for Performance

### Recommended Indexes:

1. **Tasks Collection**:
   - `status` + `createdAt` (for listing active tasks)
   - `assignedTo` + `status` (for driver's tasks)
   - `createdBy` + `createdAt` (for dispatcher's history)

2. **Drivers Collection**:
   - `status` + `lastUpdated` (for active drivers)
   - `assignedDispatcher` + `status` (for team management)

3. **Vehicles Collection**:
   - `status` + `lastUpdated` (for available vehicles)

---

## 🔄 Data Sync Strategy

### Real-time Listeners:
```javascript
// Listen to user's assigned tasks
db.collection('tasks')
  .where('assignedTo', '==', userId)
  .where('status', '!=', 'completed')
  .orderBy('status')
  .orderBy('dueDate')
  .onSnapshot(snapshot => {
    // Update UI with real-time data
  });

// Listen to driver location updates
db.collection('drivers')
  .where('assignedDispatcher', '==', dispatcherId)
  .onSnapshot(snapshot => {
    // Update map with driver locations
  });
```

---

## 📊 Analytics Events

Key events to track in Firebase Analytics:

- `user_login` - Track authentication
- `task_created` - New task creation
- `task_completed` - Task completion
- `route_optimized` - AI route optimization
- `delivery_confirmed` - Delivery confirmation
- `driver_online` - Driver goes online
- `vehicle_maintenance` - Maintenance alerts

---

## 🔔 Real-time Notifications

### Firebase Cloud Messaging Topics:

- `drivers_{teamId}` - Messages for specific team drivers
- `dispatchers` - Messages for all dispatchers
- `admins` - Messages for admin users
- `task_updates_{taskId}` - Updates for specific task
- `vehicle_alerts_{vehicleId}` - Vehicle-specific alerts

---

This structure ensures scalability, security, and real-time synchronization across the entire Agape Care fleet management system.
