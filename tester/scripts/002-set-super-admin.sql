-- Set fernandosardo@gmail.com as super admin
-- Run this AFTER the user has registered

UPDATE profiles 
SET is_super_admin = true 
WHERE email = 'fernandosardo@gmail.com';
