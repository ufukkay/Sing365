#!/bin/sh
# Runs once, when the database volume is first created. The app connects as a normal owner role
# (not a superuser), so the row-level security in the migrations applies to it.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
create role sing365_app login password '${DB_APP_PASSWORD}' nosuperuser nobypassrls;
create database sing365 owner sing365_app encoding 'UTF8' locale_provider 'builtin' builtin_locale 'C.UTF-8' template template0;
SQL
