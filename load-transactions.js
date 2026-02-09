// Load transactions with proper UUID mapping
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://cejvjzisceycxotljskx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlanZqemlzY2V5Y3hvdGxqc2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDU1NDgsImV4cCI6MjA4NjAyMTU0OH0.pzz8CcMl3vpVutRVe64i2CYxM33T-0uVcAcqrafGZXo'

const supabase = createClient(supabaseUrl, supabaseKey)

async function loadTransactions() {
  console.log('🚀 Loading transactions with UUID mapping...\n')

  try {
    // Load transactions JSON
    console.log('📂 Reading transactions.json...')
    const transactions = JSON.parse(readFileSync(join(__dirname, 'src/data/transactions.json'), 'utf-8'))
    console.log(`   Found ${transactions.length} transactions\n`)

    // Get customer and product mappings
    console.log('🔍 Fetching customer and product mappings...')
    const { data: customers } = await supabase.from('customers').select('id, customer_code')
    const { data: products } = await supabase.from('products').select('id, product_code')

    const customerMap = new Map(customers.map(c => [c.customer_code, c.id]))
    const productMap = new Map(products.map(p => [p.product_code, p.id]))
    console.log(`   Mapped ${customerMap.size} customers and ${productMap.size} products\n`)

    // Transform transactions to match database schema
    console.log('🔄 Transforming transactions...')
    const transformedTransactions = transactions.map(t => ({
      transaction_code: t.transaction_code,
      customer_id: customerMap.get(t.customer_code),
      product_id: productMap.get(t.product_code),
      transaction_date: t.transaction_date,
      quantity_liters: t.quantity_liters,
      unit_price: t.unit_price,
      total_amount: t.total_amount,
      payment_due_date: t.payment_due_date,
      payment_received_date: t.payment_received_date,
      outstanding_amount: t.outstanding_amount || 0,
      payment_status: t.payment_status,
      invoice_number: t.invoice_number,
      salesperson: t.salesperson,
      region: t.region
    })).filter(t => t.customer_id && t.product_id) // Only include valid mappings

    console.log(`   Transformed ${transformedTransactions.length} transactions\n`)

    // Insert in batches of 50
    console.log('💰 Inserting transactions...')
    const batchSize = 50
    let loadedCount = 0

    for (let i = 0; i < transformedTransactions.length; i += batchSize) {
      const batch = transformedTransactions.slice(i, i + batchSize)
      const { error } = await supabase.from('transactions').insert(batch)

      if (error) {
        console.error(`\n❌ Error in batch ${Math.floor(i / batchSize) + 1}:`, error.message)
      } else {
        loadedCount += batch.length
        process.stdout.write(`\r   Progress: ${loadedCount}/${transformedTransactions.length} transactions`)
      }
    }

    console.log(`\n\n✅ Successfully loaded ${loadedCount} transactions!`)
    console.log('\n🎉 Data load complete!')
    console.log('   Refresh your browser to see the Executive Dashboard with data.\n')

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    process.exit(1)
  }
}

loadTransactions()
