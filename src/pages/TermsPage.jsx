import { useNavigate } from 'react-router-dom';

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 p-6">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-12">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate('/')}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <div className="flex-1 h-px bg-gradient-to-r from-neutral-700 to-transparent"></div>
        </div>
        
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-xl text-neutral-400">
            Last updated: July 28, 2025
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-neutral-900/50 backdrop-blur-xl p-12 rounded-3xl border border-neutral-700/50 prose prose-invert max-w-none">
          
          <h2 className="text-2xl font-bold text-white mb-6">1. Acceptance of Terms</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            By accessing and using Lungo AI ("Service"), you accept and agree to be bound by the terms and provision of this agreement. 
            If you do not agree to abide by the above, please do not use this service.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">2. Service Description</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            Lungo AI is an artificial intelligence content generation platform that provides:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Text-to-image generation using various AI models</li>
            <li>Text-to-video generation capabilities</li>
            <li>Image-to-video conversion services</li>
            <li>AI model access and management tools</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">3. User Accounts and Registration</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            To access certain features of our Service, you must register for an account. You agree to:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain and promptly update your account information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Accept all risks of unauthorized access to your account</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">4. Acceptable Use Policy</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            You agree not to use the Service to generate, create, or distribute content that:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Is illegal, harmful, threatening, abusive, or discriminatory</li>
            <li>Infringes on intellectual property rights of others</li>
            <li>Contains explicit sexual content involving minors</li>
            <li>Promotes violence, hatred, or harassment</li>
            <li>Violates privacy rights of individuals</li>
            <li>Is used for spam, phishing, or other malicious activities</li>
            <li>Attempts to circumvent our safety filters or guidelines</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">5. Credits and Payment</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            Our Service operates on a credit-based system:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Credits are required to generate content using AI models</li>
            <li>Different models consume different amounts of credits</li>
            <li>Credits are non-refundable except as required by law</li>
            <li>Subscription fees are charged in advance and are non-refundable</li>
            <li>We reserve the right to change pricing with 30 days notice</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">6. Intellectual Property</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            Content ownership and rights:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>You retain ownership of content you create using our Service</li>
            <li>You grant us a license to process and store your content to provide the Service</li>
            <li>Our AI models, software, and platform remain our intellectual property</li>
            <li>You are responsible for ensuring your generated content doesn't infringe others' rights</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">7. Content Moderation</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            We employ automated and human moderation systems to ensure compliance with our policies. 
            We reserve the right to remove content, suspend accounts, or terminate service for violations of these terms.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">8. Service Availability</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            While we strive for high availability, we do not guarantee uninterrupted service. 
            We may suspend or discontinue the Service for maintenance, updates, or other operational reasons.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">9. Limitation of Liability</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            To the maximum extent permitted by law, Lungo AI shall not be liable for any indirect, incidental, 
            special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred 
            directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">10. Termination</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            Either party may terminate this agreement at any time. Upon termination, your right to use the Service 
            ceases immediately. We may retain your data as described in our Privacy Policy.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">11. Changes to Terms</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            We reserve the right to modify these terms at any time. We will notify users of significant changes 
            via email or platform notifications. Continued use after changes constitutes acceptance of new terms.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">12. Governing Law</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            These terms are governed by and construed in accordance with the laws of [Jurisdiction], 
            without regard to conflict of law principles.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">13. Contact Information</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            For questions about these Terms of Service, please contact us at:
            <br />
            Email: deniz@lungoai.com
            <br />
            Address: [Company Address]
          </p>

          <div className="mt-12 pt-8 border-t border-neutral-700/50 text-center">
            <p className="text-sm text-neutral-500">
              By using Lungo AI, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TermsPage;