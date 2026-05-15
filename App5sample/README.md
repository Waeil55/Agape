# Agape Care - Fleet Management System

A professional, enterprise-grade fleet management and dispatch system built with React.

## Features

- **Admin Dashboard** - Complete fleet oversight and analytics
- **Dispatcher Interface** - Real-time task assignment and fleet monitoring  
- **Driver Mobile App** - Route navigation, task management, and offline support
- **Live GPS Tracking** - Real-time vehicle location and status
- **Smart Task Assignment** - AI-powered optimal route planning
- **Maintenance Alerts** - Proactive vehicle maintenance scheduling
- **Offline Capability** - Continue operations during connectivity loss
- **Multi-role Access Control** - Secure role-based access management

## Tech Stack

- **Frontend**: React 18.3 with Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Build Tool**: Vite

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Starts the development server at http://localhost:3000

### Production Build

```bash
npm run build
```

Creates an optimized production build in the `dist` directory.

## Project Structure

```
├── src/
│   ├── components/       # Reusable React components
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles with Tailwind
├── public/              # Static assets
│   └── agape.png        # Application logo
├── package.json         # Project dependencies
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind CSS config
└── postcss.config.js    # PostCSS configuration
```

## Default Login Credentials

- **Admin**: admin@agapecare.com / password
- **Dispatcher**: dispatcher@agapecare.com / password  
- **Driver**: driver@agapecare.com / password

(For development/demo purposes only)

## License

© 2026 Agape Care. All rights reserved.
