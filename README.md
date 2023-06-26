# migration-wordpress-mysql

## Installation

Clone/Download this project and run the command given below in a terminal:

```bash
npm install
```

This command will install the required node files on your system.

# Run the script

run this command in the terminal

`npm run export`

## Configuration

It will ask you prompt like this and you have to add your hostname, username, password(if any), port no.(if any), database

```bash
    "host":"<<mysql host>>",
    "user":"<<mysql username>>",
    "password":"<<mysql password>>",
    "database":"<<mysql database of wordpress>>",
```

For example:

```bash
    "mysql":{
        "host":"localhost",
        "user":"root",
        "password":"",
        "database":"workshop"
    }
```
