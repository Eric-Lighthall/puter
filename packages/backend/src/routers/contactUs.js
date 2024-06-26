/*
 * Copyright (C) 2024 Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
"use strict"
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.js');
const config = require('../config');
const { get_user, generate_random_str } = require('../helpers');
const { DB_WRITE } = require('../services/database/consts.js');

// -----------------------------------------------------------------------//
// POST /contactUs
// -----------------------------------------------------------------------//
router.post('/contactUs', auth, express.json(), async (req, res, next)=>{
    // check subdomain
    if(require('../helpers').subdomain(req) !== 'api')
        next();

    // check if user is verified
    if((config.strict_email_verification_required || req.user.requires_email_confirmation) && !req.user.email_confirmed)
        return res.status(400).send({code: 'account_is_not_verified', message: 'Account is not verified'});

    // message is required
    if(!req.body.message)
        return res.status(400).send({message: 'message is required'})
    // message must be a string
    if(typeof req.body.message !== 'string')
        return res.status(400).send('message must be a string.')
    // message is too long
    else if(req.body.message.length > 100000)
        return res.status(400).send({message: 'message is too long'})

    const svc_edgeRateLimit = req.services.get('edge-rate-limit');
    if ( ! svc_edgeRateLimit.check('contact-us') ) {
        return res.status(429).send('Too many requests.');
    }

    // modules
    const db = req.services.get('database').get(DB_WRITE, 'feedback');

    try{
        db.write(
            `INSERT INTO feedback
            (user_id, message) VALUES
            (     ?,    ?)`,
            [
                //user_id
                req.user.id,
                //message
                req.body.message,
            ]
        );

        // get user
        let user = await get_user({id: req.user.id});

        // send email to support
        const nodemailer = require("nodemailer");

        // send email notif
        let transporter = nodemailer.createTransport({
            host: config.smtp_server,
            port: config.smpt_port,
            secure: true, // STARTTLS
            auth: {
                user: config.smtp_username,
                pass: config.smtp_password,
            },
        });

        transporter.sendMail({
            from: '"Puter" no-reply@puter.com', // sender address
            to: 'support@puter.com', // list of receivers
            replyTo: user.email === null ? undefined : user.email,
            subject: `Your Feedback/Support Request (#${generate_random_str(4)})`, // Subject line
            text: req.body.message,
        });

        return res.send({});
    }catch(e){
        return res.status(400).send(e);
    }
})

module.exports = router