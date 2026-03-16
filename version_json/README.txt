
# Si la base de datos (JSON) se actualizó en la web
git pull

# Para subir cambios:
git add .
git commit -m "web deployment v1.0”
git push


# O si se está totalmente seguro de subir los cambios:
git push --force

# NOTA: esto sobre-escribirá las actas en la web!


# Initializing (old)

git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/frosalesortega/inaoe-actas-cca.git
git push -u origin main
