# Map Generation Configs

This folder stores valid map generation configurations used by the WorldGuessr map generation system.

## Purpose

Map gen configs define how locations are selected and distributed when generating custom maps. Each JSON file in this directory represents a different configuration that can be used to create maps with specific characteristics.

## Configuration Structure

Each map gen config contains:

- **CountryCodes**: Array of country codes to include in the map (use `"*"` for all countries)
- **DistributionStrategy**: Defines how locations are distributed
  - `Key`: The distribution algorithm (e.g., `FixedCountByMaxMinDistance`)
  - `LocationCountGoal`: Target number of locations to generate
  - `MinMinDistance`: Minimum distance between locations (in km)
  - `TreatCountriesAsSingleSubdivision`: Countries to treat as single units
  - `CountryDistributionFromMap`: Reference map for distribution patterns
- **ProximityFilter**: (Optional) Filter locations based on proximity to a reference file
  - `LocationsPath`: Path to CSV file with reference locations
  - `Radius`: Radius for proximity filtering (in km)

## Example Configs

- **aeuw.json**: All countries configuration with proximity filtering

## Credits

Credit to **SlashP** for the map generation system and configuration format.
