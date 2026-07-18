const MAP_CONST = {
  MIN_LOCATIONS: 5,
  // Ceiling set by MongoDB's 16MB/doc BSON cap: all locations live in one
  // map doc, and fully-annotated locations (panoId/heading/pitch/country)
  // measure ~113 bytes each in BSON → 120k ≈ 13MB, leaving margin for longer
  // panoId formats. The API also hard-guards the real serialized size on save.
  MAX_LOCATIONS: 120000,
  MAX_NAME_LENGTH: 30,
  MIN_NAME_LENGTH: 3,
  MAX_SHORT_DESCRIPTION_LENGTH: 100,
  MIN_SHORT_DESCRIPTION_LENGTH: 20,
  MAX_LONG_DESCRIPTION_LENGTH: 1000,
  MIN_LONG_DESCRIPTION_LENGTH: 100,
  MIN_MAP_INTERVAL: 3600000 // 1 hour
};
export default MAP_CONST;