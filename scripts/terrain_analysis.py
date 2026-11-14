"""Create terrain metrics for farming regions from a DEM and GeoJSON boundaries."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.mask import mask

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily"


def terrain_metrics(geometry, dem: rasterio.DatasetReader) -> dict[str, float | None]:
    """Return elevation and slope metrics for one region."""
    clipped, transform = mask(dem, [geometry], crop=True, filled=False)
    elevation = clipped[0].astype("float32")
    values = elevation.compressed()
    if values.size == 0:
        return {
            "elevation_mean_m": None,
            "elevation_min_m": None,
            "elevation_max_m": None,
            "slope_mean_degrees": None,
            "steep_area_percent": None,
        }

    pixel_y = abs(transform.e)
    pixel_x = abs(transform.a)
    gradient_y, gradient_x = np.gradient(elevation.filled(np.nan), pixel_y, pixel_x)
    slope = np.degrees(np.arctan(np.sqrt(gradient_x**2 + gradient_y**2)))
    valid_slope = slope[~elevation.mask]

    return {
        "elevation_mean_m": round(float(values.mean()), 2),
        "elevation_min_m": round(float(values.min()), 2),
        "elevation_max_m": round(float(values.max()), 2),
        "slope_mean_degrees": round(float(valid_slope.mean()), 2),
        "steep_area_percent": round(float((valid_slope > 8).mean() * 100), 2),
    }


def fetch_climate_observations(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    timeout: int = 30,
) -> dict[str, dict[str, float]]:
    """Fetch daily temperature and precipitation from NASA POWER."""
    query = urlencode(
        {
            "parameters": "T2M,PRECTOTCORR",
            "community": "AG",
            "longitude": f"{longitude:.6f}",
            "latitude": f"{latitude:.6f}",
            "start": start_date.strftime("%Y%m%d"),
            "end": end_date.strftime("%Y%m%d"),
            "format": "JSON",
        }
    )
    request = Request(
        f"{NASA_POWER_URL}?{query}",
        headers={"User-Agent": "TerraCycle-AI/1.0"},
    )
    with urlopen(request, timeout=timeout) as response:
        payload = json.load(response)

    parameters = payload.get("properties", {}).get("parameter", {})
    temperature = parameters.get("T2M")
    precipitation = parameters.get("PRECTOTCORR")
    if not isinstance(temperature, dict) or not isinstance(precipitation, dict):
        raise ValueError("NASA POWER response did not contain T2M and PRECTOTCORR data")

    return {
        "temperature_c": {
            day: float(value) for day, value in temperature.items() if float(value) > -900
        },
        "precipitation_mm": {
            day: float(value)
            for day, value in precipitation.items()
            if float(value) > -900
        },
    }


def _annual_values(
    observations: dict[str, dict[str, float]],
) -> dict[str, dict[int, float]]:
    """Aggregate daily observations into annual means or totals."""
    annual: dict[str, dict[int, list[float]]] = {
        "temperature_c": {},
        "precipitation_mm": {},
    }
    for metric, values in observations.items():
        for day, value in values.items():
            year = int(day[:4])
            annual[metric].setdefault(year, []).append(value)

    return {
        "temperature_c": {
            year: float(np.mean(values))
            for year, values in annual["temperature_c"].items()
        },
        "precipitation_mm": {
            year: float(np.sum(values))
            for year, values in annual["precipitation_mm"].items()
        },
    }


def _predict_next_year(values: dict[int, float]) -> tuple[float | None, float | None]:
    """Return a linear-trend prediction and its yearly slope."""
    if len(values) < 2:
        return None, None
    years = np.array(sorted(values), dtype=float)
    measurements = np.array([values[int(year)] for year in years], dtype=float)
    slope, intercept = np.polyfit(years, measurements, 1)
    next_year = years[-1] + 1
    return float(intercept + slope * next_year), float(slope)


def climate_metrics(
    geometry,
    start_date: date,
    end_date: date,
    timeout: int = 30,
) -> dict[str, float | int | None]:
    """Summarize NASA POWER climate observations and predict the next year."""
    centroid = geometry.centroid
    if centroid.is_empty or not np.isfinite(centroid.x + centroid.y):
        raise ValueError("Region geometry has no usable centroid for climate analysis")

    observations = fetch_climate_observations(
        latitude=float(centroid.y),
        longitude=float(centroid.x),
        start_date=start_date,
        end_date=end_date,
        timeout=timeout,
    )
    annual = _annual_values(observations)
    predicted_temperature, temperature_trend = _predict_next_year(
        annual["temperature_c"]
    )
    predicted_precipitation, precipitation_trend = _predict_next_year(
        annual["precipitation_mm"]
    )
    observed_years = set(annual["temperature_c"]) | set(annual["precipitation_mm"])
    prediction_year = max(observed_years, default=None)
    if prediction_year is not None:
        prediction_year += 1

    return {
        "climate_mean_temp_c": round(
            float(np.mean(list(observations["temperature_c"].values()))), 2
        )
        if observations["temperature_c"]
        else None,
        "climate_total_precip_mm": round(
            float(np.sum(list(observations["precipitation_mm"].values()))), 2
        )
        if observations["precipitation_mm"]
        else None,
        "climate_temp_trend_c_per_year": (
            round(temperature_trend, 4) if temperature_trend is not None else None
        ),
        "climate_precip_trend_mm_per_year": (
            round(precipitation_trend, 2) if precipitation_trend is not None else None
        ),
        "climate_predicted_temp_c": (
            round(predicted_temperature, 2)
            if predicted_temperature is not None
            else None
        ),
        "climate_predicted_precip_mm": (
            round(predicted_precipitation, 2)
            if predicted_precipitation is not None
            else None
        ),
        "climate_prediction_year": prediction_year,
    }


def analyze_regions(
    regions_path: Path,
    dem_path: Path,
    output_path: Path,
    climate_start: date | None = None,
    climate_end: date | None = None,
    climate_timeout: int = 30,
) -> None:
    regions = gpd.read_file(regions_path)
    if regions.empty:
        raise ValueError(f"No regions found in {regions_path}")
    if "area_key" not in regions.columns:
        raise ValueError("Input GeoJSON must contain an 'area_key' property")
    if regions.crs is None:
        raise ValueError("Input GeoJSON must define a coordinate reference system")
    if (climate_start is None) != (climate_end is None):
        raise ValueError("--climate-start and --climate-end must be provided together")
    if climate_start is not None and climate_end is not None and climate_start > climate_end:
        raise ValueError("--climate-start must not be after --climate-end")

    with rasterio.open(dem_path) as dem:
        projected = regions.to_crs(dem.crs)
        metrics = [terrain_metrics(geometry, dem) for geometry in projected.geometry]

    if climate_start is not None and climate_end is not None:
        climate_regions = regions.to_crs("EPSG:4326")
        for region, result in zip(climate_regions.geometry, metrics):
            result.update(
                climate_metrics(
                    region,
                    start_date=climate_start,
                    end_date=climate_end,
                    timeout=climate_timeout,
                )
            )

    for key in metrics[0]:
        regions[key] = [result[key] for result in metrics]
    regions["terrain_status"] = regions["slope_mean_degrees"].map(
        lambda value: "Unavailable" if value is None else (
            "Steep" if value >= 8 else "Rolling" if value >= 3 else "Flat"
        )
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    regions.to_crs("EPSG:4326").to_file(output_path, driver="GeoJSON")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regions", type=Path, default=Path("data/farming_regions.geojson"))
    parser.add_argument("--dem", type=Path, required=True, help="NASA DEM GeoTIFF")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/terrain-analysis.geojson"),
    )
    parser.add_argument(
        "--climate-start",
        type=date.fromisoformat,
        help="Optional NASA POWER start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--climate-end",
        type=date.fromisoformat,
        help="Optional NASA POWER end date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--climate-timeout",
        type=int,
        default=30,
        help="NASA POWER request timeout in seconds",
    )
    args = parser.parse_args()
    analyze_regions(
        args.regions,
        args.dem,
        args.output,
        climate_start=args.climate_start,
        climate_end=args.climate_end,
        climate_timeout=args.climate_timeout,
    )


if __name__ == "__main__":
    main()
