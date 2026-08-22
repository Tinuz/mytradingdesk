import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "../packages/database/src/ingestion-repository";
import { CoinGeckoProvider, FredProvider, IngestionPipeline } from "../packages/providers/src";

const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`${name} is missing`);return value;};
const repository=new SupabaseIngestionRepository(createClient(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}}));
const pipeline=new IngestionPipeline(repository); const to=new Date(); const historyDays=300; const from=new Date(to.getTime()-historyDays*86_400_000);
const coinGecko=new CoinGeckoProvider(process.env.COINGECKO_API_KEY);
for(const indicator of ["BTC_USD","ETH_USD"] as const){const observations=await coinGecko.fetchRange(indicator,from,to);const result=await pipeline.ingest(coinGecko,indicator,observations);console.log(JSON.stringify({indicator,rangeDays:historyDays,...result}));}
const fred=new FredProvider(required("FRED_API_KEY")); const yieldHistory=await fred.fetchRange("US10Y_REAL",from,to); const yieldResult=await pipeline.ingest(fred,"US10Y_REAL",yieldHistory);console.log(JSON.stringify({indicator:"US10Y_REAL",rangeDays:historyDays,...yieldResult}));
