# Picnic Hyper-Personalisation -- Q-Hack 2026

> Smart grocery recommendations + shared household shopping for Picnic

## Demo

<video src="Demo-QHack_Kober.mov" controls width="100%"></video>

## Projects

### [Recommendation Engine](./recommendation_model/README.md)

A predictive recommendation engine that learns from customer purchase history to suggest what they'll buy next. Uses a multi-rule pipeline enhanced by Gemini LLM reasoning, with warehouse-aware inventory that suggests the closest available alternative when an item is out of stock.

**Stack:** FastAPI, PostgreSQL (Neon), Google Gemini, WebSockets

### [Widget Prototype -- Shared Cart](./widget_prototype/README.md)

A home screen widget and shared cart system that lets household members collaboratively build their grocery order without opening the app. Long-press to add items, see real-time updates from other household members, and get AI-powered basket suggestions.

**Stack:** Next.js 16, React 19, Zustand, Tailwind CSS, FastAPI, PostgreSQL (Neon), WebSockets

## Quick Start

```bash
# Terminal 1: Backend
cd widget_prototype/backend
pip install -r requirements.txt
cp .env.example .env  # Set DATABASE_URL and GEMINI_API_KEY
uvicorn api.main:app --reload --port 8000

# Terminal 2: Frontend
cd widget_prototype/picnic-frontend
npm install
npm run dev
```

Open `http://localhost:3000` to see the demo.

## Authors

sumanth.rc@icloud.com, manjunathreddy0707@gmail.com, amruthdisha1000@gmail.com, sudhanvagermany@gmail.com, vamshidharpratap@gmail.com
