# Picnic Smart Cart Widget -- Shared Household Shopping

> Q-Hack 2026 | Home screen widget + shared cart with real-time collaboration

## What It Does

A home screen widget and shared cart system for Picnic that lets household members collaboratively build their grocery order -- without ever opening the app. Long-press the widget, add items, and they appear in every household member's cart instantly via WebSocket sync. Built on top of the [Recommendation Engine](../recommendation_model/README.md) for smart suggestions and warehouse-aware inventory.

## Two Core Features

### 1. Home Screen Widget

A customizable widget that lives on the user's home screen:

- **Quick add** -- long-press to search and add items directly from the widget
- **Glanceable** -- shows item count, order day, and who recently added items
- **Tap to open** -- jumps straight to the cart inside the app
- **Glass morphism UI** -- frosted glass design with blur and saturation effects
- **Live avatars** -- color-coded initials of the last few people who added items

### 2. Shared Cart

Household members join via a share code (`PICNIC-XXXXXX`) and shop together in real-time:

- **Real-time sync** -- add, update, or remove items and every member sees it instantly
- **Who added what** -- each item shows the member's name and color
- **Live activity** -- toast notifications when someone adds an item ("Emma just added Oat Milk")
- **Stock awareness** -- items show in_stock / low_stock / out_of_stock status
- **Smart substitutes** -- when an item is unavailable, suggests the closest alternative from the same fulfillment center
- **Recommendations** -- AI-powered basket suggestions based on the household's purchase history

## Architecture

```
backend/
  api/main.py          -- FastAPI server: REST + WebSocket endpoints
  engine/              -- Recommendation pipeline (shared with recommendation_model)
    analytics.py       -- 4 behavioral analytics tables
    rules.py           -- 5-rule engine (frequency, cycle, drift, browse, popular)
    llm_enrichment.py  -- Gemini API for summaries + substitutes
    orchestrator.py    -- Pipeline coordinator
  db/connection.py     -- PostgreSQL (Neon) pool

picnic-frontend/
  src/components/
    widget/
      cart-widget.tsx       -- The home screen widget component
      widget-home-screen.tsx -- Widget shell / preview
    app/
      picnic-app.tsx        -- Main 3-tab layout (Home, Cart, Profile)
      home-page.tsx         -- Product browsing + search
      cart-page.tsx         -- Cart view + recommendations
      login-page.tsx        -- Authentication
      profile-page.tsx      -- Household management
  src/lib/
    store.ts           -- Zustand state (single source of truth)
    api.ts             -- REST + WebSocket client
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| State | Zustand 5 |
| Styling | Tailwind CSS 4, Framer Motion |
| UI Components | shadcn/ui, Base UI React |
| Backend | FastAPI 0.115, Uvicorn |
| Database | PostgreSQL (Neon), psycopg3 |
| Real-time | WebSockets |
| LLM | Google Generative AI (Gemini) |

## Running the Demo

You need two terminals -- one for the backend, one for the frontend.

### Terminal 1: Backend

```bash
cd widget_prototype/backend
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Set DATABASE_URL and GEMINI_API_KEY in .env

# Start the API server (auto-creates DB tables on first run)
uvicorn api.main:app --reload --port 8000
```

Backend will be running at `http://localhost:8000`.

### Terminal 2: Frontend

```bash
cd widget_prototype/picnic-frontend
npm install
npm run dev
```

Frontend will be running at `http://localhost:3000`. Open this URL in your browser to see the demo.

### Quick Demo Walkthrough

1. Open `http://localhost:3000` -- you'll see the widget home screen
2. Tap the widget or "Open App" to enter the Picnic app
3. Log in with any available customer name (e.g. firstname.lastname@picnic.com)
4. Browse products on the Home tab, add items to cart
5. Go to Profile tab to create a household or join one with a share code
6. Open a second browser tab, log in as a different customer, join the same household
7. Add items from either tab -- both carts update in real-time via WebSocket

For database related queries reach out to amruthdisha1000@gmail.com 

### Authors
sumanth.rc@icloud.com, manjunathreddy0707@gmail.com, amruthdisha1000@gmail.com , sudhanvagermany@gmail.com, vamshidharpratap@gmail.com