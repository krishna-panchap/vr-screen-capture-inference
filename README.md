# Python Yolo

run to kill process

```
sudo kill `sudo lsof -t -i:8080`
```

run to setup key:

```
openssl genrsa -out private_key.key 2048
```

```
openssl req -new -key private_key.key -out certificate.csr
```

```
openssl x509 -req -days 365 -in certificate.csr -signkey private_key.key -out certificate.crt
```

and put them in the `/sec` folder
