// Types and Enums
export const DataType = {
  STRING: 'String',
  NUMBER: 'Number',
  BOOLEAN: 'Boolean',
  DATE: 'Date',
  CATEGORY: 'Category',
  UNKNOWN: 'Unknown'
};

export const SemanticRole = {
  DIMENSION: 'Dimension', // e.g., City, Product Name
  METRIC: 'Metric',       // e.g., Revenue, Qty
  ENTITY: 'Entity',       // e.g., Customer ID
  TIMESTAMP: 'Timestamp', // e.g., Order Date
  HIERARCHY: 'Hierarchy', // e.g., Region (Parent of City)
  IGNORED: 'Ignored'      // e.g., Empty or Metadata
};
