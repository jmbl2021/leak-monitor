-- Add stock ticker field for public companies
-- This tracks the stock exchange ticker symbol for public companies (e.g., "AAPL", "MSFT")
-- or ticker symbols for parent companies if the victim is a subsidiary

ALTER TABLE victims
ADD COLUMN stock_ticker VARCHAR(20);

COMMENT ON COLUMN victims.stock_ticker IS 'Stock ticker symbol for the company or its parent (e.g., AAPL, MSFT)';
