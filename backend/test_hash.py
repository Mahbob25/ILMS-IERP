import bcrypt
h = b"$2b$12$vI8aWBnW3fID.1FlkeFLG.h.D9UkII.e/4/Zf6m48yF37b6qY.Dma"
print("admin123:", bcrypt.checkpw(b"admin123", h))
print("admin:", bcrypt.checkpw(b"admin", h))
print("password:", bcrypt.checkpw(b"password", h))
