from fastapi import FastAPI

app = FastAPI(
    title="Meal Planner API",
    version="0.1.0",
)


@app.get("/v1/health", tags=["system"])
def get_health() -> dict[str, str]:
    return {"status": "ok"}