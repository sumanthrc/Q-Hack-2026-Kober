# Picnic Smart Basket -- Recommendation Engine

> Q-Hack 2026 | Predictive grocery recommendations with warehouse-aware inventory

## What It Does

A recommendation engine for Picnic that predicts what groceries a customer will buy next, based on their purchase history and habits. It runs a multi-rule pipeline enhanced by LLM reasoning, and is fully aware of per-fulfillment-center stock levels -- suggesting the closest available alternative when an item is out of stock.

## Architecture

```
engine/
  analytics.py      -- Computes 3 behavioral tables per customer
  rules.py          -- 4-rule recommendation engine (frequency, cycle, drift, popular)
  llm_enrichment.py -- Gemini API for basket summaries + substitute suggestions
  orchestrator.py   -- Coordinates the full pipeline: analytics -> rules -> LLM -> persist

db/
  connection.py     -- PostgreSQL (Neon) connection pool via psycopg3

main.py             -- FastAPI server with REST + WebSocket endpoints
run.py              -- CLI for training, generating, and managing baskets
```


### Warehouse-Aware Inventory

Every recommendation checks real stock at the customer's fulfillment center (FC):
        - Example: If 3.5% Fat Milk is unavailable at the nearest hub, the engine suggests 1.5% Fat Milk as the closest alternative.

### LLM Layer (Google Gemini)

- **Basket summary**: Generates a friendly 1-sentence overview (e.g. *"Running low on oat milk again, are we?"*)
- **Substitute suggestions**: Picks the best alternative from in-stock items in the same subcategory

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI 0.115, Uvicorn |
| Database | PostgreSQL (Neon), psycopg3 with connection pooling |
| LLM | Google Generative AI (Gemini) |
| Real-time | WebSockets for cart sync |

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Set DATABASE_URL and GEMINI_API_KEY in .env

# Start the server
python run.py serve
# or: uvicorn main:app --reload --port 8000
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
