-- ============================================================
-- Óptica Boavista — Pré-mapeamento de fornecedores → grupo
-- Só marcas reconhecidas com confiança. Os distribuidores portugueses
-- genéricos e entradas não-produto ficam DE FORA (decidir no Admin).
-- Grupos: 'oftalmicas' | 'contacto_saude' | 'armacoes_sol'
-- Correr em: Supabase → SQL Editor. Atualiza só o 'grupo' (não toca objetivo/rappel).
-- ============================================================

INSERT INTO public.supplier_config (proveedor, nome, grupo) VALUES
  -- === LENTES OFTÁLMICAS ===
  ('ESSILOR',    'ESSILOR ESPAÑA, S.A.',        'oftalmicas'),
  ('HOYA',       'HOYA LENS IBERIA, LDA.',      'oftalmicas'),
  ('ZEISS',      'ZEISS',                       'oftalmicas'),
  ('ZEISS99',    'ZEISS',                       'oftalmicas'),
  ('ZEISS3',     'A. WINTER, LDA.',             'oftalmicas'),  -- conta Zeiss? confirmar
  ('Rodenstock', 'Rodenstock',                  'oftalmicas'),
  ('Shamir PT',  'Shamir PT',                   'oftalmicas'),
  ('INDO',       'INDOPTICA S.A.',              'oftalmicas'),  -- Indo faz lentes (e algumas armações)
  ('KODAK',      'KODAK',                       'oftalmicas'),
  ('SEIKO',      'SEIXO',                       'oftalmicas'),  -- Seiko lentes? confirmar
  ('Novacel',    'Novacel',                     'oftalmicas'),
  ('OPTOVISION', 'OPTOVISION',                  'oftalmicas'),
  ('ALTRA',      'ALTRA - OPHTALMIC LAB',       'oftalmicas'),
  ('PRATS',      'PRATS LUSITÂNIA, S.A.',       'oftalmicas'),
  -- === LENTES DE CONTACTO + SAÚDE OCULAR ===
  ('ALCON',        'ALCON PORTUGAL',            'contacto_saude'),
  ('COOPERVISION', 'COOPERVISION',              'contacto_saude'),
  ('B. LOMB.',     'BAUSCH & LOMB',             'contacto_saude'),
  ('CIBA',         'CIBA GEIGY (Ciba Vision)',  'contacto_saude'),
  ('AVIZOR',       'AVIZOR PORTUGUESA, L.DA',   'contacto_saude'),
  ('DISOP',        'DISOP',                     'contacto_saude'),
  ('SAUFLON',      'SAUFLON',                   'contacto_saude'),
  ('HYDRON',       'VISION HYDRON',             'contacto_saude'),
  ('365',          'LENTES DE CONTACTO 365',    'contacto_saude'),
  ('OPTIFLEX',     'OPTIFLEX CONTACTOLOGIA',    'contacto_saude'),
  ('JABA',         'JABA FARMACÊUTICA, S.A.',   'contacto_saude'),  -- saúde ocular
  ('URSAPHARM',    'URSAPHARM',                 'contacto_saude'),  -- saúde ocular
  -- === ARMAÇÕES + SOL ===
  ('LUXOTTICA',     'LUXOTTICA IBERICA S.A.',   'armacoes_sol'),
  ('LUXOTTIC',      'LUXOTTICA PORTUGAL, S.A.', 'armacoes_sol'),
  ('DE RIGO',       'DE RIGO',                  'armacoes_sol'),
  ('SAFILO',        'SAFILO S.A.',              'armacoes_sol'),
  ('MARCHON',       'MARCHON',                  'armacoes_sol'),
  ('MARCOLIN',      'MARCOLIN',                 'armacoes_sol'),
  ('KERING',        'KERING EYEWEAR',           'armacoes_sol'),
  ('OAKLEY',        'OAKLEY EUROPE',            'armacoes_sol'),
  ('CÉBE',          'CÉBE, EYEWEAR',            'armacoes_sol'),
  ('MOREL',         'MOREL PORTUGAL',           'armacoes_sol'),
  ('AIR',           'LINDBERG OPTIC DESIGN',    'armacoes_sol'),
  ('ORGREEN',       'ORGREEN',                  'armacoes_sol'),
  ('GO',            'GO EYEWEAR',               'armacoes_sol'),
  ('N.A.I.F.',      'NEW AGE ITALIAN FASHION',  'armacoes_sol'),
  ('MR. SUNGLASSES','MR. SUNGLASSES',           'armacoes_sol'),
  ('DALT DEL SOL',  'DALT DEL SOL',             'armacoes_sol'),
  ('GROUPSUN',      'GROUPSUN',                 'armacoes_sol'),
  ('TKONTAKT',      'TKONTAKT EYEWEAR LDA',     'armacoes_sol')
ON CONFLICT (proveedor) DO UPDATE
  SET grupo = EXCLUDED.grupo, updated_at = now();
