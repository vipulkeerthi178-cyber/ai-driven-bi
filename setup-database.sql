-- Setup database schema for AI BI Platform
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  product_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  cost_price NUMERIC NOT NULL,
  selling_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  customer_code TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_type TEXT,
  region TEXT,
  city TEXT,
  state TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  credit_limit NUMERIC,
  payment_terms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  transaction_code TEXT PRIMARY KEY,
  customer_code TEXT REFERENCES customers(customer_code),
  product_code TEXT REFERENCES products(product_code),
  transaction_date DATE NOT NULL,
  quantity_liters NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  payment_status TEXT,
  payment_due_date DATE,
  payment_received_date DATE,
  outstanding_amount NUMERIC DEFAULT 0,
  invoice_date DATE,
  region TEXT,
  salesperson TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_code);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_code);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_region ON transactions(region);

-- Success message
SELECT 'Database schema created successfully! Now run: npm run load-data' AS status;
