insert into public.assets (symbol, name, category)
values ('BTC', 'Bitcoin', 'cryptoasset'), ('ETH', 'Ethereum', 'cryptoasset')
on conflict (symbol) do nothing;
