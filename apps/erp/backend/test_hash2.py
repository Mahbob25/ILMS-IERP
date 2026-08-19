from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

h = "$2b$12$vI8aWBnW3fID.1FlkeFLG.h.D9UkII.e/4/Zf6m48yF37b6qY.Dma"
print("verify admin123:", pwd_context.verify("admin123", h))
print("verify admin:", pwd_context.verify("admin", h))
print("verify password:", pwd_context.verify("password", h))
print("verify 123456:", pwd_context.verify("123456", h))

# Also generate a hash to compare
new_hash = pwd_context.hash("admin123")
print("new hash for admin123:", new_hash)
