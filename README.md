# EdgeBoard Sports Stats

EdgeBoard is a multi-sport betting-research interface with normalized event and market models. It runs entirely in sample mode by default and does not claim live sportsbook data.

## Run the application

Complete browser sample dataset:

```bash
python3 -m http.server 9001 --bind 127.0.0.1
```

Then open `http://127.0.0.1:9001/`.

Optional provider-gateway scaffold:

```bash
python3 -m server.app --port 9010
```

Open `http://127.0.0.1:9010/?provider=gateway` to load the gateway's mock normalized response. Without the query parameter, the browser continues to use the complete local sample dataset.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

See [Provider integration](docs/provider-integration.md) for contracts, adapters, environment variables, freshness rules, and the live-provider checklist.
