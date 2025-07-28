import { useNavigate } from 'react-router-dom';

const PrivacyPage = () => {
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
          <h1 className="text-5xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-xl text-neutral-400">
            Last updated: July 28, 2025
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-neutral-900/50 backdrop-blur-xl p-12 rounded-3xl border border-neutral-700/50 prose prose-invert max-w-none">
          
          <h2 className="text-2xl font-bold text-white mb-6">1. Introduction</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            Lungo AI ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains 
            how we collect, use, disclose, and safeguard your information when you use our AI content generation platform.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">2. Information We Collect</h2>
          
          <h3 className="text-xl font-semibold text-white mb-4">2.1 Personal Information</h3>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We collect personal information that you voluntarily provide to us when you:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-6 list-disc list-inside space-y-2">
            <li>Register for an account (name, email address)</li>
            <li>Make payments (billing information, processed securely by Stripe)</li>
            <li>Contact our support team</li>
            <li>Subscribe to our communications</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mb-4">2.2 Usage Data</h3>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We automatically collect certain information when you use our Service:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-6 list-disc list-inside space-y-2">
            <li>Log data (IP address, browser type, pages visited, time stamps)</li>
            <li>Device information (device type, operating system, unique identifiers)</li>
            <li>Usage patterns (features used, generation frequency, credit consumption)</li>
            <li>Performance data (load times, errors, crash reports)</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mb-4">2.3 Content Data</h3>
          <p className="text-neutral-300 leading-relaxed mb-6">
            We process content you create using our Service, including prompts, generated images/videos, 
            and associated metadata. This content is processed to provide the Service and improve our AI models.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">3. How We Use Your Information</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We use collected information for the following purposes:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Providing and maintaining our Service</li>
            <li>Processing payments and managing subscriptions</li>
            <li>Improving our AI models and Service quality</li>
            <li>Personalizing your experience</li>
            <li>Communicating with you about Service updates</li>
            <li>Detecting and preventing fraud or abuse</li>
            <li>Complying with legal obligations</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">4. Information Sharing and Disclosure</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We may share your information in the following circumstances:
          </p>
          
          <h3 className="text-xl font-semibold text-white mb-4">4.1 Service Providers</h3>
          <ul className="text-neutral-300 leading-relaxed mb-6 list-disc list-inside space-y-2">
            <li>Firebase (authentication, database, hosting) - Google</li>
            <li>Stripe (payment processing)</li>
            <li>AI model providers (OpenAI, Google, Replicate, etc.)</li>
            <li>Analytics and monitoring services</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mb-4">4.2 Legal Requirements</h3>
          <p className="text-neutral-300 leading-relaxed mb-6">
            We may disclose your information if required by law, court order, or to protect our rights and safety.
          </p>

          <h3 className="text-xl font-semibold text-white mb-4">4.3 Business Transfers</h3>
          <p className="text-neutral-300 leading-relaxed mb-8">
            In the event of a merger, acquisition, or sale, your information may be transferred to the new entity.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">5. Data Security</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We implement appropriate security measures to protect your information:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Encryption of data in transit and at rest</li>
            <li>Secure authentication systems</li>
            <li>Regular security assessments and updates</li>
            <li>Access controls and employee training</li>
            <li>Secure payment processing through Stripe</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">6. Data Retention</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We retain your information for as long as necessary to:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Provide our Service to you</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes and enforce agreements</li>
            <li>Generated content: 90 days after deletion request</li>
            <li>Account data: 7 years after account closure (for legal compliance)</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">7. Your Privacy Rights</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            Depending on your location, you may have the following rights:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li><strong>Access:</strong> Request a copy of your personal information</li>
            <li><strong>Correction:</strong> Update or correct inaccurate information</li>
            <li><strong>Deletion:</strong> Request deletion of your personal information</li>
            <li><strong>Portability:</strong> Receive your data in a portable format</li>
            <li><strong>Restriction:</strong> Limit how we process your information</li>
            <li><strong>Objection:</strong> Object to certain processing activities</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mb-6">8. Cookies and Tracking</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">
            We use cookies and similar technologies to:
          </p>
          <ul className="text-neutral-300 leading-relaxed mb-8 list-disc list-inside space-y-2">
            <li>Maintain your login session</li>
            <li>Remember your preferences</li>
            <li>Analyze usage patterns</li>
            <li>Provide personalized content</li>
          </ul>
          <p className="text-neutral-300 leading-relaxed mb-8">
            You can control cookies through your browser settings, but some features may not function properly without them.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">9. Third-Party AI Models</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            Our Service integrates with third-party AI providers. When you use these models, your prompts and 
            generated content may be processed by these providers according to their privacy policies. 
            We recommend reviewing the privacy policies of OpenAI, Google, Anthropic, and other model providers.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">10. Children's Privacy</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            Our Service is not intended for children under 13 years of age. We do not knowingly collect 
            personal information from children under 13.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">11. International Data Transfers</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            Your information may be transferred to and processed in countries other than your own. 
            We ensure appropriate safeguards are in place for such transfers.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">12. Changes to This Privacy Policy</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            We may update this Privacy Policy from time to time. We will notify you of any material changes 
            via email or through our Service.
          </p>

          <h2 className="text-2xl font-bold text-white mb-6">13. Contact Us</h2>
          <p className="text-neutral-300 leading-relaxed mb-8">
            If you have any questions about this Privacy Policy or our privacy practices, please contact us at:
            <br />
            Email: deniz@lungoai.com
            <br />
            Address: [Company Address]
          </p>

          <div className="mt-12 pt-8 border-t border-neutral-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">GDPR Compliance</h3>
            <p className="text-neutral-300 leading-relaxed mb-4">
              For users in the European Union, we comply with GDPR requirements:
            </p>
            <ul className="text-neutral-300 leading-relaxed mb-6 list-disc list-inside space-y-2">
              <li>Legal basis for processing: Contract performance and legitimate interests</li>
              <li>Data Protection Officer: deniz@lungoai.com</li>
              <li>Right to lodge a complaint with supervisory authorities</li>
            </ul>
          </div>

          <div className="mt-8 pt-8 border-t border-neutral-700/50 text-center">
            <p className="text-sm text-neutral-500">
              This Privacy Policy is effective as of the date stated above and will remain in effect except with respect to any changes in its provisions in the future.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;