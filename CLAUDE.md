# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Frontend (React + Vite):**
- `npm run dev` - Start development server
- `npm run build` - Build for production 
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

**Firebase Functions:**
- `cd functions && npm run serve` - Start Firebase emulator for functions
- `cd functions && npm run deploy` - Deploy functions to Firebase
- `cd functions && npm run logs` - View function logs

**Firebase Hosting:**
- `firebase deploy --only hosting` - Deploy frontend to Firebase hosting
- `firebase emulators:start` - Start local Firebase emulators

## Architecture Overview

LungoAI is a React-based AI content generation platform with Firebase backend. The app uses a node-based canvas interface for content workflows.

**Frontend Stack:**
- React 19 with Vite build system
- TailwindCSS for styling
- React Router for navigation
- ReactFlow for canvas node interface
- Tldraw for drawing capabilities
- Firebase Auth for authentication

**Backend Stack:**
- Firebase Functions (Node.js 20)
- Firestore for data storage
- Firebase Storage for file uploads
- AI integrations: OpenAI, Replicate, Google Vertex AI
- Stripe for payments

**Key Pages:**
- `/` - Dashboard (protected route)
- `/generation` - AI content generation
- `/campaigns` - Campaign creator
- `/studio` - Canvas workspace with ReactFlow nodes

**Core Services:**
- `src/services/ai.js` - AI generation logic with credit management
- `functions/index.js` - Firebase Cloud Functions for AI processing
- `src/firebase.js` - Firebase configuration and auth context

**Canvas Workspace:**
The main feature is a ReactFlow-based canvas (`src/pages/CanvasWorkspace.jsx`) where users create content generation workflows using interconnected nodes. Each node type represents different AI operations or content transformations.

**AI Integration:**
The platform supports multiple AI providers through Firebase Functions, with credit-based usage tracking and image generation rules defined in `src/services/imageRules.json`.

## Key Files to Understand
- `src/App.jsx` - Main app routing and authentication flow
- `src/pages/CanvasWorkspace.jsx` - Primary workspace interface  
- `src/services/ai.js` - Frontend AI service integration
- `functions/index.js` - Backend AI processing and Firebase functions
- `src/services/imageRules.json` - AI generation rule configurations