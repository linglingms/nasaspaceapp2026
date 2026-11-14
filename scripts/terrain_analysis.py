"""Create terrain metrics for farming regions from a DEM and GeoJSON boundaries."""

from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.mask import mask


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


def analyze_regions(regions_path: Path, dem_path: Path, output_path: Path) -> None:
    regions = gpd.read_file(regions_path)
    if regions.empty:
        raise ValueError(f"No regions found in {regions_path}")
    if "area_key" not in regions.columns:
        raise ValueError("Input GeoJSON must contain an 'area_key' property")

    with rasterio.open(dem_path) as dem:
        projected = regions.to_crs(dem.crs)
        metrics = [terrain_metrics(geometry, dem) for geometry in projected.geometry]

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
    args = parser.parse_args()
    analyze_regions(args.regions, args.dem, args.output)


if __name__ == "__main__":
    main()
