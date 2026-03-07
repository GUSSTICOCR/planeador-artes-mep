import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = "AIzaSyCL-cn0BYHhs-VyRGqoZtruDe5WjcsEh10";

async function testApiKey() {
    try {
        console.log("Verificando API Key...");
        const genAI = new GoogleGenerativeAI(apiKey);
        
        console.log("Intentando listar modelos disponibles...");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if(data.models) {
            console.log("Modelos disponibles:");
            data.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods})`));
        } else {
            console.log("Error consultando modelos:", data);
        }
        
    } catch (error) {
        console.error("Error fatal:", error.message);
    }
}

testApiKey();
