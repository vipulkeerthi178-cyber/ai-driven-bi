// Load sample data into Supabase
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Supabase configuration
const supabaseUrl = 'https://cejvjzisceycxotljskx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlanZqemlzY2V5Y3hvdGxqc2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDU1NDgsImV4cCI6MjA4NjAyMTU0OH0.pzz8CcMl3vpVutRVe64i2CYxM33T-0uVcAcqrafGZXo'

const supabase = createClient(supabaseUrl, supabaseKey)

async function loadData() {
  console.log('🚀 Starting data load...\n')

  try {
    // Load JSON files
    console.log('📂 Reading JSON files...')
    const products = JSON.parse(readFileSync(join(__dirname, 'src/data/products.json'), 'utf-8'))
    const customers = JSON.parse(readFileSync(join(__dirname, 'src/data/customers.json'), 'utf-8'))
    const transactions = JSON.parse(readFileSync(join(__dirname, 'src/data/transactions.json'), 'utf-8'))

    // Load Products
    console.log(`\n📦 Loading ${products.length} products...`)
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .upsert(products, { onConflict: 'product_code' })

    if (productsError) {
      console.error('❌ Error loading products:', productsError.message)
    } else {
      console.log(`✅ Loaded ${products.length} products successfully`)
    }

    // Load Customers
    console.log(`\n👥 Loading ${customers.length} customers...`)
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .upsert(customers, { onConflict: 'customer_code' })

    if (customersError) {
      console.error('❌ Error loading customers:', customersError.message)
    } else {
      console.log(`✅ Loaded ${customers.length} customers successfully`)
    }

    // Load Transactions (in batches of 100)
    console.log(`\n💰 Loading ${transactions.length} transactions...`)
    const batchSize = 100
    let loadedCount = 0

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize)
      const { data, error } = await supabase
        .from('transactions')
        .insert(batch)

      if (error) {
        console.error(`❌ Error loading batch ${i / batchSize + 1}:`, error.message)
      } else {
        loadedCount += batch.length
        process.stdout.write(`\r   Progress: ${loadedCount}/${transactions.length}`)
      }
    }

    console.log(`\n✅ Loaded ${loadedCount} transactions successfully`)

    console.log('\n🎉 Data load completed!\n')
    console.log('You can now refresh your browser to see the dashboard with data.')

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    process.exit(1)
  }
}

loadData()
