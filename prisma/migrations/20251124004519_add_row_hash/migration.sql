/*
  Warnings:

  - Added the required column `row_hash` to the `sales_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sales_transactions" (
    "transaction_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "commercial_responsible" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "billing_sign" TEXT,
    "delivery_client" TEXT NOT NULL,
    "delivery_circuit" TEXT NOT NULL,
    "product_category" TEXT NOT NULL,
    "product_family" TEXT NOT NULL,
    "product_reference" TEXT NOT NULL,
    "delivery_date" DATETIME NOT NULL,
    "quantity" DECIMAL,
    "sales_altona" DECIMAL,
    "purchases_altona_eur" DECIMAL,
    "purchases_purchase_currency" DECIMAL,
    "purchase_currency" TEXT,
    "direct_sales" DECIMAL NOT NULL,
    "commission_altona" DECIMAL NOT NULL,
    "total_pub_budget" DECIMAL,
    "rfa_on_resale_orders" DECIMAL,
    "logistics_cost_altona" DECIMAL,
    "prescriber_commission" DECIMAL,
    "total_net_margin_eur" DECIMAL NOT NULL,
    "row_hash" TEXT NOT NULL
);
INSERT INTO "new_sales_transactions" ("billing_sign", "commercial_responsible", "commission_altona", "delivery_circuit", "delivery_client", "delivery_date", "direct_sales", "logistics_cost_altona", "order_type", "prescriber_commission", "product_category", "product_family", "product_reference", "purchase_currency", "purchases_altona_eur", "purchases_purchase_currency", "quantity", "rfa_on_resale_orders", "sales_altona", "supplier", "total_net_margin_eur", "total_pub_budget", "transaction_id") SELECT "billing_sign", "commercial_responsible", "commission_altona", "delivery_circuit", "delivery_client", "delivery_date", "direct_sales", "logistics_cost_altona", "order_type", "prescriber_commission", "product_category", "product_family", "product_reference", "purchase_currency", "purchases_altona_eur", "purchases_purchase_currency", "quantity", "rfa_on_resale_orders", "sales_altona", "supplier", "total_net_margin_eur", "total_pub_budget", "transaction_id" FROM "sales_transactions";
DROP TABLE "sales_transactions";
ALTER TABLE "new_sales_transactions" RENAME TO "sales_transactions";
CREATE UNIQUE INDEX "sales_transactions_row_hash_key" ON "sales_transactions"("row_hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
