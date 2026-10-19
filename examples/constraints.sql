CREATE TABLE accounts (id integer PRIMARY KEY, name text, email varchar(200) UNIQUE);
CREATE UNIQUE INDEX accounts_email ON accounts (email);
