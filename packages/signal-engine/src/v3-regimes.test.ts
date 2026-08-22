import{describe,expect,it}from"vitest";import{evaluateV3Regimes}from"./v3-regimes";import type{V3EngineIndicator,V3EngineObservation,V3ObservationSeries}from"./types";
const asOf=new Date("2026-08-22T00:00:00Z");
type Options={macro?:-1|0|1;crypto?:-1|0|1;market?:"healthy"|"overheated"|"deleveraging"|"capitulation";asset?:-1|0|1;stale?:boolean};
function fixture({macro=0,crypto=0,market="healthy",asset=0,stale=false}:Options):V3ObservationSeries{const all:Partial<Record<V3EngineIndicator,V3EngineObservation[]>>={};const add=(indicator:V3EngineIndicator,date:Date,value:number)=>{const row:V3EngineObservation={indicator,observedAt:date,value,quality:stale?"STALE":"VALID"};(all[indicator]??=[]).push(row);};const ago=(days:number)=>new Date(asOf.getTime()-days*86_400_000);
 for(const code of ["GLOBAL_LIQUIDITY_USD","US_NET_LIQUIDITY_USD"]as const){add(code,ago(100),100);add(code,asOf,100+macro*5);}add("US10Y_REAL",ago(31),2);add("US10Y_REAL",asOf,2-macro*.6);add("DXY",ago(31),100);add("DXY",asOf,100-macro*4);
 add("STABLECOIN_GROWTH_30D_PERCENT",asOf,crypto*2.5);add("STABLECOIN_GROWTH_90D_PERCENT",asOf,crypto*5);add("STABLECOIN_GROWTH_ACCELERATION_PP",asOf,crypto*2);add("DEFI_LOANS_GROWTH_30D_PERCENT",asOf,crypto*10);add("BTC_ETF_FLOW_20D_USD",asOf,crypto*2.5e9);add("ETH_ETF_FLOW_20D_USD",asOf,crypto*5e8);
 const marketValues={healthy:{mvrv:1.8,ratio:.015,oi:100,loss:.001},overheated:{mvrv:4,ratio:.05,oi:100,loss:.001},deleveraging:{mvrv:1.8,ratio:.015,oi:40,loss:.006},capitulation:{mvrv:.8,ratio:.01,oi:35,loss:.03}}[market];add("BTC_MVRV",asOf,marketValues.mvrv);add("BTC_OI_MARKET_CAP_RATIO",asOf,marketValues.ratio);add("BTC_PERPETUAL_OI_USD",ago(100),100);add("BTC_PERPETUAL_OI_USD",asOf,marketValues.oi);add("BTC_MARKET_CAP_USD",asOf,1e12);add("BTC_REALIZED_LOSSES_USD",asOf,marketValues.loss*1e12);
 for(let i=0;i<250;i++){const date=ago(249-i);add("BTC_USD",date,50_000*(1+asset*.002*i));add("ETH_USD",date,2_500*(1+asset*.0025*i));}return all;}
const scenarios=[
 ["strong risk-on",{macro:1,crypto:1,asset:1,market:"healthy"},"HEALTHY"],
 ["early expansion",{macro:1,crypto:0,asset:0,market:"healthy"},"HEALTHY"],
 ["healthy bull market",{macro:1,crypto:1,asset:1,market:"healthy"},"HEALTHY"],
 ["overheated bull market",{macro:1,crypto:1,asset:1,market:"overheated"},"OVERHEATED"],
 ["liquidity deterioration",{macro:-1,crypto:-1,asset:0,market:"healthy"},"HEALTHY"],
 ["deleveraging",{macro:0,crypto:0,asset:-1,market:"deleveraging"},"CAPITULATION"],
 ["capitulation",{macro:-1,crypto:-1,asset:-1,market:"capitulation"},"CAPITULATION"],
 ["risk-off",{macro:-1,crypto:-1,asset:-1,market:"healthy"},"HEALTHY"],
 ["conflicting regimes",{macro:1,crypto:-1,asset:0,market:"healthy"},"HEALTHY"]
]as const;
describe("v3 named regime fixtures",()=>{it.each(scenarios)("%s is deterministic and independently observable",(_name,options,marketState)=>{const input={asOf,observations:fixture(options)};const first=evaluateV3Regimes(input),second=evaluateV3Regimes(input);expect(first).toEqual(second);expect(first.marketStructure.state).toBe(marketState);expect(first.macroLiquidity.status).toBe("AVAILABLE");expect(first.cryptoCreditLiquidity.status).toBe("AVAILABLE");expect(first.assets.BTC.status).toBe("AVAILABLE");expect(first.assets.ETH.status).toBe("AVAILABLE");});it("stale data fails closed",()=>{const result=evaluateV3Regimes({asOf,observations:fixture({stale:true})});expect(result.macroLiquidity.status).toBe("INSUFFICIENT_DATA");expect(result.cryptoCreditLiquidity.status).toBe("INSUFFICIENT_DATA");expect(result.marketStructure.status).toBe("INSUFFICIENT_DATA");expect(result.assets.BTC.status).toBe("INSUFFICIENT_DATA");});});
