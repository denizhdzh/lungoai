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

LungoAI is a React-based AI content generation platform with a Firebase backend. The app previously used a node-based canvas interface but now relies on a streamlined generation page.

**Frontend Stack:**
- React 19 with Vite build system  
- TailwindCSS for styling  
- React Router for navigation  
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
- `/studio` - ❌ Deprecated (previous canvas workspace)

**Core Services:**
- `src/services/ai.js` - AI generation logic with credit management  
- `functions/index.js` - Firebase Cloud Functions for AI processing  
- `src/firebase.js` - Firebase configuration and auth context  
- `src/config/models.js` - AI model configuration and rules (replaces `imageRules.json`)

## Styling & CSS Rules

Global design follows a dark-neutral theme with limited use of lime as an accent:

- Page background: `bg-neutral-950`  
- Primary containers and surfaces: `bg-neutral-900`  
- Secondary layers: `bg-neutral-800/50`  
- All buttons, text, borders, icons: `white`  
- Lime (`lime`) can be used as an accent color but must not exceed **20%** of the visual weight on any page.

TailwindCSS is used for all styling. Avoid custom styles unless strictly necessary.

## Claude Coding Rules

> These rules must be strictly followed when Claude Code works in this repository:

1. ❌ **Never generate non-working or placeholder code.**  
   Only provide code that is 100% functional and directly compatible with this project.

2. ❌ **Do not make assumptions or fake fixed implementations.**  
   If you are unsure about something, ask the user instead of guessing.

3. ✅ **Only write code when you fully understand the requirements.**  
   Otherwise, request clarification before proceeding.

4. 🧪 **All code must reflect the actual state of the project.**  
   Version compatibility, folder structure, and real usage must always be correct.