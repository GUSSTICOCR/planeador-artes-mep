const fs = require('fs');
const path = require('path');

const email = 'rivasmarcela328@gmail.com';
const paidUsersFile = path.join(__dirname, 'paid_users.json');

function activateUser(email) {
    let users = [];
    if (fs.existsSync(paidUsersFile)) {
        users = JSON.parse(fs.readFileSync(paidUsersFile, 'utf8'));
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60); // 60 days from now

    const existingUserIndex = users.findIndex(u => u.email === email.toLowerCase());
    if (existingUserIndex > -1) {
        users[existingUserIndex].expiresAt = expiresAt.toISOString();
        console.log(`Updated user ${email} expiry to ${expiresAt.toISOString()}`);
    } else {
        users.push({ 
            email: email.toLowerCase(), 
            expiresAt: expiresAt.toISOString() 
        });
        console.log(`Added new user ${email} with expiry ${expiresAt.toISOString()}`);
    }

    fs.writeFileSync(paidUsersFile, JSON.stringify(users, null, 2));
    console.log('paid_users.json updated successfully.');
}

activateUser(email);
