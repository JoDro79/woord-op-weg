exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { email } = JSON.parse(event.body);

  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Ongeldig e-mailadres.' }) };
  }

  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      email: email,
      listIds: [3],
      updateEnabled: true
    })
  });

  if (response.status === 201 || response.status === 204) {
    return { statusCode: 200, body: JSON.stringify({ message: 'Welkom! Controleer je inbox voor een bevestigingsmail.' }) };
  } else if (response.status === 400) {
    return { statusCode: 200, body: JSON.stringify({ message: 'Dit e-mailadres is al aangemeld.' }) };
  } else {
    return { statusCode: 200, body: JSON.stringify({ message: 'Je bent aangemeld voor de nieuwsbrief!' }) };
  }
};
