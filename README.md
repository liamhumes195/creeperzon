# Creeperzon Market

A small online storefront with a product catalog, shopping bag, customer checkout, and a private incoming-orders dashboard. Orders and the starter product catalog are stored in PostgreSQL. Checkout records customer and delivery details, but does not process or collect payment information.

## Deploy with Railway

1. Create a Railway project and add a **PostgreSQL** database.
2. Add this app as a service from the repository.
3. In the app service's variables, set:
   - `DATABASE_URL` to the PostgreSQL connection URL provided by Railway (for example, `${{Postgres.DATABASE_URL}}`; use your database service's actual name).
   - `ADMIN_TOKEN` to a long, randomly generated secret. This protects the incoming-orders dashboard.
4. Deploy. Railway installs `requirements.txt` and starts the web service using the included `Procfile`.
5. Open the deployed store and select **Orders** in the header. Enter the `ADMIN_TOKEN` value to view and update order statuses.

On its first connection, the app creates the required tables and adds eight sample products to an empty product catalog. Order totals are calculated from database prices, not from the browser's cart.

## Run locally

Use Python 3.10 or newer and install the requirements. Put the connection URL for a reachable PostgreSQL database in the ignored local `.env` file as `DATABASE_URL=...`, and set `ADMIN_TOKEN` to a private value before starting:

```powershell
python -m pip install -r requirements.txt
$env:ADMIN_TOKEN = "your-private-admin-token"
python app.py
```

Then open `http://localhost:5000`.

The Railway `*.railway.internal` database address is only reachable from Railway services; it will not connect from a local computer. To develop locally against Railway PostgreSQL, use the database's public connection URL instead.
