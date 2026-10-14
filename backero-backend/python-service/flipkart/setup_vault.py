from fkpulse.vault import Vault
v = Vault('vault.enc', 'Fkp_Vault_9284_Secure')
v.set('fk_app_id', '5b844516613447b9730b859a1b45a52b7679')
v.set('fk_app_secret', '1d788fad00f3207b417cbd51db0f887d8')
print('vault created:', v.keys())
